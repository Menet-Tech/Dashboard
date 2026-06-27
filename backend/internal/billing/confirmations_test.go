package billing

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/notifications"
)

type dummyWhatsAppSender struct {
	payloads chan notifications.BillMessagePayload
}

func (d *dummyWhatsAppSender) SendTemplate(ctx context.Context, payload notifications.BillMessagePayload) error {
	select {
	case d.payloads <- payload:
	default:
	}
	return nil
}

func (d *dummyWhatsAppSender) SendDirectMessage(ctx context.Context, accountID, toNumber, body string) error {
	return nil
}

func setupConfirmationsTest(t *testing.T) (*sql.DB, Service) {
	db := billingTestDB(t)
	wa := &dummyWhatsAppSender{payloads: make(chan notifications.BillMessagePayload, 10)}
	service := Service{
		Repository:    Repository{DB: db},
		WhatsApp:      wa,
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}
	return db, service
}

func TestCreatePaymentConfirmation(t *testing.T) {
	db, service := setupConfirmationsTest(t)
	ctx := context.Background()

	// Seed package, customer and bill
	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', 'INV-001', 250000, '2026-04-08', 'belum_bayar')`)

	bukti := "uploads/payment-proofs/test.png"
	id, err := service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar tagihan")
	if err != nil {
		t.Fatalf("failed to create confirmation: %v", err)
	}
	if id <= 0 {
		t.Fatalf("expected valid id, got %d", id)
	}

	// Try to create duplicate
	_, err = service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar lagi")
	if err == nil {
		t.Fatal("expected duplicate confirmation to fail, but it succeeded")
	}
}

func TestListPendingConfirmations(t *testing.T) {
	db, service := setupConfirmationsTest(t)
	ctx := context.Background()

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', 'INV-001', 250000, '2026-04-08', 'belum_bayar')`)

	bukti := "uploads/payment-proofs/test.png"
	_, err := service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar tagihan Budi")
	if err != nil {
		t.Fatalf("failed to create confirmation: %v", err)
	}

	list, err := service.ListPendingConfirmations(ctx)
	if err != nil {
		t.Fatalf("failed to list pending confirmations: %v", err)
	}

	if len(list) != 1 {
		t.Fatalf("expected 1 confirmation, got %d", len(list))
	}

	if list[0].CustomerName != "Budi" {
		t.Errorf("expected customer name 'Budi', got %q", list[0].CustomerName)
	}
	if list[0].InvoiceNumber != "INV-001" {
		t.Errorf("expected invoice 'INV-001', got %q", list[0].InvoiceNumber)
	}
}

func TestApprovePaymentConfirmation(t *testing.T) {
	db, service := setupConfirmationsTest(t)
	ctx := context.Background()

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', 'INV-001', 250000, '2026-04-08', 'belum_bayar')`)

	bukti := "uploads/payment-proofs/test.png"
	confID, err := service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar tagihan Budi")
	if err != nil {
		t.Fatalf("failed to create confirmation: %v", err)
	}

	err = service.ApprovePaymentConfirmation(ctx, confID, 1)
	if err != nil {
		t.Fatalf("failed to approve confirmation: %v", err)
	}

	// Verify confirmation status
	var status string
	err = db.QueryRow("SELECT status FROM payment_confirmations WHERE id = ?", confID).Scan(&status)
	if err != nil {
		t.Fatalf("failed to query confirmation: %v", err)
	}
	if status != "approved" {
		t.Errorf("expected status 'approved', got %q", status)
	}

	// Verify bill status
	var billStatus string
	err = db.QueryRow("SELECT status FROM tagihan WHERE id = 1").Scan(&billStatus)
	if err != nil {
		t.Fatalf("failed to query bill: %v", err)
	}
	if billStatus != "lunas" {
		t.Errorf("expected bill status 'lunas', got %q", billStatus)
	}

	// Verify proof attachment on bill
	var billProof sql.NullString
	err = db.QueryRow("SELECT proof_path FROM tagihan WHERE id = 1").Scan(&billProof)
	if err != nil {
		t.Fatalf("failed to query bill proof: %v", err)
	}
	if !billProof.Valid || billProof.String != bukti {
		t.Errorf("expected bill proof %q, got %q", bukti, billProof.String)
	}
}

func TestRejectPaymentConfirmation(t *testing.T) {
	db, service := setupConfirmationsTest(t)
	ctx := context.Background()

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', 'INV-001', 250000, '2026-04-08', 'belum_bayar')`)

	bukti := "uploads/payment-proofs/test.png"
	confID, err := service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar tagihan Budi")
	if err != nil {
		t.Fatalf("failed to create confirmation: %v", err)
	}

	err = service.RejectPaymentConfirmation(ctx, confID)
	if err != nil {
		t.Fatalf("failed to reject confirmation: %v", err)
	}

	// Verify confirmation status
	var status string
	err = db.QueryRow("SELECT status FROM payment_confirmations WHERE id = ?", confID).Scan(&status)
	if err != nil {
		t.Fatalf("failed to query confirmation: %v", err)
	}
	if status != "rejected" {
		t.Errorf("expected status 'rejected', got %q", status)
	}

	// Verify bill status is still 'belum_bayar'
	var billStatus string
	err = db.QueryRow("SELECT status FROM tagihan WHERE id = 1").Scan(&billStatus)
	if err != nil {
		t.Fatalf("failed to query bill: %v", err)
	}
	if billStatus != "belum_bayar" {
		t.Errorf("expected bill status 'belum_bayar', got %q", billStatus)
	}
}

func TestGetPendingConfirmationForBill(t *testing.T) {
	db, service := setupConfirmationsTest(t)
	ctx := context.Background()

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', 'INV-001', 250000, '2026-04-08', 'belum_bayar')`)

	// Initially, should be nil
	pc, err := service.GetPendingConfirmationForBill(ctx, 1)
	if err != nil {
		t.Fatalf("failed to query pending confirmation: %v", err)
	}
	if pc != nil {
		t.Errorf("expected nil confirmation, got %v", pc)
	}

	bukti := "uploads/payment-proofs/test.png"
	_, err = service.CreatePaymentConfirmation(ctx, 1, 1, &bukti, "Bayar tagihan Budi")
	if err != nil {
		t.Fatalf("failed to create confirmation: %v", err)
	}

	// Now should return the pending confirmation
	pc, err = service.GetPendingConfirmationForBill(ctx, 1)
	if err != nil {
		t.Fatalf("failed to query pending confirmation: %v", err)
	}
	if pc == nil {
		t.Fatal("expected pending confirmation, got nil")
	}
	if pc.Status != "pending_review" {
		t.Errorf("expected status 'pending_review', got %q", pc.Status)
	}
}
