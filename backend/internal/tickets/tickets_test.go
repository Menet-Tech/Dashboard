package tickets_test

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/tickets"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT,
			nomor_wa TEXT
		);
		CREATE TABLE tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pelanggan_id INTEGER REFERENCES pelanggan(id),
			nama TEXT NOT NULL,
			no_hp TEXT NOT NULL,
			alamat TEXT,
			kendala TEXT NOT NULL,
			status TEXT DEFAULT 'open',
			created_at DATETIME,
			updated_at DATETIME
		);
		CREATE TABLE ticket_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ticket_id INTEGER REFERENCES tickets(id),
			sender_type TEXT CHECK(sender_type IN ('admin', 'customer')),
			message TEXT NOT NULL,
			created_at DATETIME,
			is_read INTEGER DEFAULT 0,
			read_at DATETIME
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestTicketService(t *testing.T) {
	db := setupTestDB(t)
	repo := tickets.Repository{DB: db}
	settingsRepo := settings.Repository{DB: db}
	settingsSvc := settings.Service{Repository: settingsRepo}
	waSvc := notifications.WhatsAppService{Settings: settingsSvc}
	svc := tickets.Service{Repository: repo, WhatsApp: waSvc}
	ctx := context.Background()

	// Seed one customer to check WA mapping
	_, err := db.Exec(`INSERT INTO pelanggan (nama, nomor_wa) VALUES ('Irfan', '6281234567890')`)
	if err != nil {
		t.Fatalf("failed to insert customer: %v", err)
	}

	t.Run("CreateTicket - Validations", func(t *testing.T) {
		_, err := svc.CreateTicket(ctx, tickets.Ticket{Nama: "", NoHP: "08123"})
		if err == nil {
			t.Fatal("expected error with empty name")
		}
	})

	t.Run("CreateTicket - Success with auto customer mapping", func(t *testing.T) {
		input := tickets.Ticket{
			Nama:    "Irfan",
			NoHP:    "081234567890",
			Alamat:  "Jl. Merdeka",
			Kendala: "Internet mati",
		}

		created, err := svc.CreateTicket(ctx, input)
		if err != nil {
			t.Fatalf("failed to create ticket: %v", err)
		}

		if created.ID == 0 {
			t.Fatal("expected non-zero ticket ID")
		}
		if created.PelangganID == nil || *created.PelangganID != 1 {
			t.Errorf("expected auto mapping to pelanggan ID 1, got %v", created.PelangganID)
		}
	})

	t.Run("AddTicketMessage & Auto-Read updates", func(t *testing.T) {
		// Add customer message
		msgCustomer, err := svc.AddTicketMessage(ctx, 1, "customer", "halo admin")
		if err != nil {
			t.Fatalf("failed to add customer message: %v", err)
		}
		if msgCustomer.SenderType != "customer" {
			t.Errorf("expected customer sender type, got %q", msgCustomer.SenderType)
		}

		// Add admin message
		msgAdmin, err := svc.AddTicketMessage(ctx, 1, "admin", "halo pelanggan")
		if err != nil {
			t.Fatalf("failed to add admin message: %v", err)
		}

		// Check detail reads customer messages as read
		detail, err := svc.GetTicketDetail(ctx, 1)
		if err != nil {
			t.Fatalf("failed to get ticket detail: %v", err)
		}

		if len(detail.Messages) != 2 {
			t.Errorf("expected 2 messages, got %d", len(detail.Messages))
		}

		// First message (customer) should now be read because admin replied and detail was retrieved
		var customerMsgRead int
		err = db.QueryRow("SELECT is_read FROM ticket_messages WHERE id = ?", msgCustomer.ID).Scan(&customerMsgRead)
		if err != nil {
			t.Fatalf("failed to query customer message read state: %v", err)
		}
		if customerMsgRead != 1 {
			t.Errorf("expected customer message to be marked read (1), got %d", customerMsgRead)
		}

		// Admin message remains unread (will be read when customer fetches it, but admin fetch doesn't mark it read)
		var adminMsgRead int
		_ = db.QueryRow("SELECT is_read FROM ticket_messages WHERE id = ?", msgAdmin.ID).Scan(&adminMsgRead)
		if adminMsgRead != 0 {
			t.Errorf("expected admin message to be unread (0) in DB, got %d", adminMsgRead)
		}
	})

	t.Run("ListTickets and CloseTicket", func(t *testing.T) {
		list, err := svc.ListTickets(ctx, "open")
		if err != nil {
			t.Fatalf("failed to list tickets: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 open ticket, got %d", len(list))
		}

		err = svc.CloseTicket(ctx, 1)
		if err != nil {
			t.Fatalf("failed to close ticket: %v", err)
		}

		listClosed, err := svc.ListTickets(ctx, "closed")
		if err != nil {
			t.Fatalf("failed to list closed tickets: %v", err)
		}
		if len(listClosed) != 1 {
			t.Errorf("expected 1 closed ticket, got %d", len(listClosed))
		}
	})
}
