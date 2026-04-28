package billing

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestServiceGenerateCreatesBillsForEligibleCustomers(t *testing.T) {
	db := billingTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (2, 'Sari', 1, 31, 'inactive')`)

	result, err := service.Generate(context.Background(), "2026-04")
	if err != nil {
		t.Fatalf("generate bills: %v", err)
	}

	if result.Generated != 1 {
		t.Fatalf("expected 1 generated bill, got %d", result.Generated)
	}
}

type mockWhatsAppSender struct {
	payloads chan notifications.BillMessagePayload
}

func (m *mockWhatsAppSender) SendTemplate(ctx context.Context, payload notifications.BillMessagePayload) error {
	m.payloads <- payload
	return nil
}

func TestServiceMarkPaidCreatesHistoryAndRestoresCustomerStatus(t *testing.T) {
	db := billingTestDB(t)
	waSender := &mockWhatsAppSender{payloads: make(chan notifications.BillMessagePayload, 1)}
	service := Service{
		Repository: Repository{DB: db},
		WhatsApp:   waSender,
	}

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'limit')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', '08-04-2026/1/20/001', 250000, '2026-04-08', 'belum_bayar')`)

	if err := service.MarkPaid(context.Background(), 1, "transfer", 1); err != nil {
		t.Fatalf("mark paid: %v", err)
	}

	var status string
	if err := db.QueryRow(`SELECT status FROM pelanggan WHERE id = 1`).Scan(&status); err != nil {
		t.Fatalf("read customer status: %v", err)
	}

	if status != "active" {
		t.Fatalf("expected customer status active after payment, got %q", status)
	}

	payload := <-waSender.payloads
	if payload.TriggerKey != "lunas" {
		t.Fatalf("expected WA trigger 'lunas', got %q", payload.TriggerKey)
	}
	if payload.BillID != 1 {
		t.Fatalf("expected bill ID 1 in WA payload, got %d", payload.BillID)
	}
}

func billingTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		t.Fatalf("enable sqlite foreign keys: %v", err)
	}

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	return db
}

func mustBillingExec(t *testing.T, db *sql.DB, query string) {
	t.Helper()

	if _, err := db.Exec(query); err != nil {
		t.Fatalf("exec query %q: %v", query, err)
	}
}
