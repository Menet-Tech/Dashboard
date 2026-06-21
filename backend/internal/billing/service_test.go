package billing

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestServiceGenerateCreatesBillsForEligibleCustomers(t *testing.T) {
	db := billingTestDB(t)
	service := Service{
		Repository:    Repository{DB: db},
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}

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

func TestServiceGenerateSkipsTrialCustomers(t *testing.T) {
	db := billingTestDB(t)
	service := Service{
		Repository:    Repository{DB: db},
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days) VALUES (1, 'Trial User', 1, 8, 'active', 1, '2026-04-01T00:00:00Z', 3)`)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days) VALUES (2, 'Regular User', 1, 8, 'active', 0, NULL, 3)`)

	result, err := service.Generate(context.Background(), "2026-04")
	if err != nil {
		t.Fatalf("generate bills: %v", err)
	}

	if result.Generated != 1 {
		t.Fatalf("expected only non-trial customer to be billed, got %d", result.Generated)
	}

	var billedTrialCount int
	if err := db.QueryRow(`SELECT COUNT(1) FROM tagihan WHERE pelanggan_id = 1`).Scan(&billedTrialCount); err != nil {
		t.Fatalf("count trial bills: %v", err)
	}
	if billedTrialCount != 0 {
		t.Fatalf("expected trial customer to be skipped by regular generator, got %d bills", billedTrialCount)
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
		Repository:    Repository{DB: db},
		WhatsApp:      waSender,
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
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

	db.SetMaxOpenConns(1)

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

func TestServiceProcessAutomation(t *testing.T) {
	db := billingTestDB(t)

	// Insert package
	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)

	// Customer 1: Bad due date. Should be skipped, doesn't halt others.
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'BadDateCust', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-04', '08-04-2026/1/20/001', 250000, 'invalid-date-format', 'belum_bayar')`)

	// Customer 2: Good due date, WhatsApp send fails. Should log and continue processing without returning error.
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (2, 'WAFailCust', 1, 14, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (2, 2, 1, '2026-04', '14-04-2026/2/20/002', 250000, '2026-04-14', 'belum_bayar')`)

	// Customer 3: Limit transition. Transition should happen from 'active' to 'limit', causing a Discord alert.
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (3, 'LimitCustFirst', 1, 8, 'active')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (3, 3, 1, '2026-04', '08-04-2026/3/20/003', 250000, '2026-04-08', 'belum_bayar')`)

	// Customer 4: Already limited. Should not trigger Discord alert or status update again.
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (4, 'LimitCustSecond', 1, 8, 'limit')`)
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (4, 4, 1, '2026-04', '08-04-2026/4/20/004', 250000, '2026-04-08', 'belum_bayar')`)

	service := Service{
		Repository:    Repository{DB: db},
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}

	waCalls := make(map[int64]int)
	discordAlerts := []string{}

	now := time.Date(2026, 4, 14, 0, 0, 0, 0, time.UTC) // 6 days overdue for April 8th due dates

	options := AutomationOptions{
		Now:            now,
		ReminderDays:   3,
		LimitDays:      5,
		TrialGraceDays: 7,
		SendWhatsApp: func(ctx context.Context, msg AutomationMessage) error {
			waCalls[msg.BillID]++
			if msg.BillID == 2 {
				return errors.New("simulated WhatsApp gateway down")
			}
			return nil
		},
		SendDiscord: func(ctx context.Context, msg string) error {
			discordAlerts = append(discordAlerts, msg)
			return nil
		},
	}

	err := service.ProcessAutomation(context.Background(), options)
	if err != nil {
		t.Fatalf("ProcessAutomation failed: %v", err)
	}

	// Verify Customer 1 (Bad date) skipped

	// Verify Customer 2 (WA Fail) did not halt execution, and SendWhatsApp was called
	if waCalls[2] != 1 {
		t.Errorf("expected SendWhatsApp to be called for Bill 2, got %d", waCalls[2])
	}

	// Verify Customer 3 transitioned to 'limit' in DB and sent Discord alert
	var status3 string
	if err := db.QueryRow(`SELECT status FROM pelanggan WHERE id = 3`).Scan(&status3); err != nil {
		t.Fatalf("failed to query status for customer 3: %v", err)
	}
	if status3 != "limit" {
		t.Errorf("expected customer 3 status to transition to 'limit', got %q", status3)
	}

	// Verify Customer 4 remained 'limit' and did not trigger DB update or Discord alert again
	var status4 string
	if err := db.QueryRow(`SELECT status FROM pelanggan WHERE id = 4`).Scan(&status4); err != nil {
		t.Fatalf("failed to query status for customer 4: %v", err)
	}
	if status4 != "limit" {
		t.Errorf("expected customer 4 status to remain 'limit', got %q", status4)
	}

	// Check Discord Alerts:
	limitAlertCount := 0
	for _, alert := range discordAlerts {
		if strings.Contains(alert, "Isolir (Limit)") {
			limitAlertCount++
			if strings.Contains(alert, "LimitCustSecond") {
				t.Errorf("unexpected Discord alert for already-limited customer LimitCustSecond: %q", alert)
			}
		}
	}

	if limitAlertCount != 1 {
		t.Errorf("expected exactly 1 limit Discord alert, got %d. Alerts: %v", limitAlertCount, discordAlerts)
	}
}

func TestServiceGenerateAppliesDiscounts(t *testing.T) {
	db := billingTestDB(t)
	service := Service{
		Repository:    Repository{DB: db},
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	
	// Customer 1: Flat discount of Rp 50.000
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, diskon, tipe_diskon) VALUES (1, 'Budi Flat', 1, 8, 'active', 50000, 'flat')`)
	
	// Customer 2: Percentage discount of 20% (20% of 250.000 = 50.000)
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, diskon, tipe_diskon) VALUES (2, 'Sari Percent', 1, 8, 'active', 20, 'percent')`)

	result, err := service.Generate(context.Background(), "2026-04")
	if err != nil {
		t.Fatalf("generate bills: %v", err)
	}

	if result.Generated != 2 {
		t.Fatalf("expected 2 generated bills, got %d", result.Generated)
	}

	// Verify bill for Customer 1 (flat discount)
	var nominal1 float64
	if err := db.QueryRow(`SELECT nominal FROM tagihan WHERE pelanggan_id = 1`).Scan(&nominal1); err != nil {
		t.Fatalf("query bill 1 nominal: %v", err)
	}
	if nominal1 != 200000 {
		t.Errorf("expected nominal 200000 (250000 - 50000), got %.2f", nominal1)
	}

	// Verify bill for Customer 2 (percent discount)
	var nominal2 float64
	if err := db.QueryRow(`SELECT nominal FROM tagihan WHERE pelanggan_id = 2`).Scan(&nominal2); err != nil {
		t.Fatalf("query bill 2 nominal: %v", err)
	}
	if nominal2 != 200000 {
		t.Errorf("expected nominal 200000 (250000 - 20%%), got %.2f", nominal2)
	}
}

func TestServiceGenerateAppliesPerpanjangan(t *testing.T) {
	db := billingTestDB(t)
	service := Service{
		Repository:    Repository{DB: db},
		Customers:     customers.Service{Repository: customers.Repository{DB: db}},
		Notifications: notifications.NotificationLogRepository{DB: db},
	}

	mustBillingExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	
	// Customer is 'pending' status
	mustBillingExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Junet Pending', 1, 8, 'pending')`)
	
	// Previous unpaid bill
	mustBillingExec(t, db, `INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, 1, '2026-03', '08-03-2026/1/20/001', 250000, '2026-03-08', 'belum_bayar')`)

	result, err := service.Generate(context.Background(), "2026-04")
	if err != nil {
		t.Fatalf("generate bills: %v", err)
	}

	if result.Generated != 1 {
		t.Fatalf("expected 1 generated bill, got %d", result.Generated)
	}

	// Verify bill for Customer 1 (nominal is double: 250000 * 2 = 500000)
	var nominal1 float64
	var status1 string
	if err := db.QueryRow(`SELECT nominal, status FROM tagihan WHERE periode = '2026-04' AND pelanggan_id = 1`).Scan(&nominal1, &status1); err != nil {
		t.Fatalf("query bill nominal: %v", err)
	}
	if nominal1 != 500000 {
		t.Errorf("expected nominal 500000, got %.2f", nominal1)
	}
	if status1 != "belum_bayar" {
		t.Errorf("expected status 'belum_bayar', got %q", status1)
	}

	// Verify old bill status is now 'lunas' with method 'perpanjangan'
	var oldStatus, oldMethod string
	if err := db.QueryRow(`SELECT status, payment_method FROM tagihan WHERE id = 1`).Scan(&oldStatus, &oldMethod); err != nil {
		t.Fatalf("query old bill: %v", err)
	}
	if oldStatus != "lunas" {
		t.Errorf("expected old bill status to be 'lunas', got %q", oldStatus)
	}
	if oldMethod != "perpanjangan" {
		t.Errorf("expected old bill method to be 'perpanjangan', got %q", oldMethod)
	}

	// Verify customer status reset to 'active'
	var custStatus string
	if err := db.QueryRow(`SELECT status FROM pelanggan WHERE id = 1`).Scan(&custStatus); err != nil {
		t.Fatalf("query customer status: %v", err)
	}
	if custStatus != "active" {
		t.Errorf("expected customer status to be 'active', got %q", custStatus)
	}
}
