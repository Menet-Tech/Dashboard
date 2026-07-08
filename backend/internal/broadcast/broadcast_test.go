package broadcast_test

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/broadcast"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	
	// Buat file temporary di disk
	tmpFile, err := os.CreateTemp("", "test-broadcast-*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := tmpFile.Name()
	tmpFile.Close()

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	
	t.Cleanup(func() {
		_ = db.Close()
		_ = os.Remove(dbPath) // Hapus berkas setelah tes selesai
	})

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			status TEXT NOT NULL,
			nomor_wa TEXT,
			email TEXT,
			odp_id INTEGER
		);
		CREATE TABLE whatsapp_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			account_id TEXT NOT NULL,
			to_number TEXT NOT NULL,
			body TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			attempts INTEGER DEFAULT 0,
			bill_id INTEGER,
			trigger_key TEXT,
			is_manual INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE email_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			to_email TEXT NOT NULL,
			subject TEXT NOT NULL,
			body TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			attempts INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestBroadcastService(t *testing.T) {
	db := setupTestDB(t)
	settingsRepo := settings.Repository{DB: db}
	settingsSvc := settings.Service{Repository: settingsRepo}
	waSvc := notifications.WhatsAppService{
		Settings: settingsSvc,
		Logs:     notifications.NotificationLogRepository{DB: db},
	}
	svc := broadcast.Service{DB: db, WhatsApp: waSvc}
	ctx := context.Background()

	// Seed customers
	_, _ = db.Exec(`
		INSERT INTO pelanggan (id, nama, status, nomor_wa, email, odp_id)
		VALUES 
			(1, 'Alice', 'active', '62811111', 'alice@test.com', 10),
			(2, 'Bob', 'limit', '62822222', '', 10),
			(3, 'Charlie', 'inactive', '62833333', 'charlie@test.com', 20),
			(4, 'David', 'active', '', 'david@test.com', 20)
	`)

	t.Run("SendBroadcast - Validation empty message", func(t *testing.T) {
		_, err := svc.SendBroadcast(ctx, "all", nil, "")
		if err == nil {
			t.Fatal("expected error on empty message")
		}
	})

	t.Run("SendBroadcast - Invalid target type", func(t *testing.T) {
		_, err := svc.SendBroadcast(ctx, "invalid_type", nil, "hello")
		if err == nil {
			t.Fatal("expected error on invalid target type")
		}
	})

	t.Run("SendBroadcast - target active", func(t *testing.T) {
		_, _ = db.Exec("DELETE FROM whatsapp_queue")
		_, _ = db.Exec("DELETE FROM email_queue")

		count, err := svc.SendBroadcast(ctx, "active", nil, "Hi {nama}")
		if err != nil {
			t.Fatalf("failed to send broadcast: %v", err)
		}
		if count != 2 { // Alice (WA + email = 1 target count), David (email only = 1 target count)
			t.Errorf("expected 2 active targets, got %d", count)
		}

		// Verify Alice's message personalized name in WA Queue
		var body string
		err = db.QueryRow("SELECT body FROM whatsapp_queue WHERE to_number = '62811111@c.us'").Scan(&body)
		if err != nil {
			t.Fatalf("failed to query Alice's WA queue: %v", err)
		}
		if body != "Hi Alice" {
			t.Errorf("expected personalized WA body 'Hi Alice', got %q", body)
		}

		// Verify David's personalized message in Email Queue
		var emailBody string
		err = db.QueryRow("SELECT body FROM email_queue WHERE to_email = 'david@test.com'").Scan(&emailBody)
		if err != nil {
			t.Fatalf("failed to query David's email queue: %v", err)
		}
		if emailBody != "Hi David" {
			t.Errorf("expected personalized email body 'Hi David', got %q", emailBody)
		}
	})

	t.Run("SendBroadcast - target limit", func(t *testing.T) {
		_, _ = db.Exec("DELETE FROM whatsapp_queue")
		_, _ = db.Exec("DELETE FROM email_queue")

		count, err := svc.SendBroadcast(ctx, "limit", nil, "Hi {nama}")
		if err != nil {
			t.Fatalf("failed to send broadcast: %v", err)
		}
		if count != 1 { // Bob (WA only)
			t.Errorf("expected 1 limit target, got %d", count)
		}
	})

	t.Run("SendBroadcast - target selected", func(t *testing.T) {
		_, _ = db.Exec("DELETE FROM whatsapp_queue")
		_, _ = db.Exec("DELETE FROM email_queue")

		// Selected Alice (1) and Charlie (3 - but Charlie is inactive, so query excludes status = inactive)
		count, err := svc.SendBroadcast(ctx, "selected", []int64{1, 3}, "Hi {nama}")
		if err != nil {
			t.Fatalf("failed to send broadcast: %v", err)
		}
		if count != 1 { // Only Alice
			t.Errorf("expected 1 selected target, got %d", count)
		}
	})

	t.Run("SendBroadcast - target ODP", func(t *testing.T) {
		_, _ = db.Exec("DELETE FROM whatsapp_queue")
		_, _ = db.Exec("DELETE FROM email_queue")

		// ODP ID 10 has Alice (active) and Bob (limit)
		count, err := svc.SendBroadcast(ctx, "odp", []int64{10}, "Hi {nama}")
		if err != nil {
			t.Fatalf("failed to send broadcast: %v", err)
		}
		if count != 2 {
			t.Errorf("expected 2 ODP targets, got %d", count)
		}
	})

	t.Run("SendBroadcast - target all", func(t *testing.T) {
		_, _ = db.Exec("DELETE FROM whatsapp_queue")
		_, _ = db.Exec("DELETE FROM email_queue")

		// Alice (1), Bob (2), David (4) (Charlie is inactive so excluded)
		count, err := svc.SendBroadcast(ctx, "all", nil, "Hi {nama}")
		if err != nil {
			t.Fatalf("failed to send broadcast: %v", err)
		}
		if count != 3 {
			t.Errorf("expected 3 all targets, got %d", count)
		}
	})
}
