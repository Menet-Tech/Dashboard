package billing

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/platform/migrate"
	"menettech/dashboard/backend/internal/settings"
)

type mockDiscordSender struct {
	messages []string
}

type mockTrialWhatsAppSender struct {
	payloads chan notifications.BillMessagePayload
}

func (m *mockTrialWhatsAppSender) SendTemplate(ctx context.Context, payload notifications.BillMessagePayload) error {
	m.payloads <- payload
	return nil
}

func (m *mockDiscordSender) SendAlert(ctx context.Context, msg string) error {
	m.messages = append(m.messages, msg)
	return nil
}

func (m *mockDiscordSender) IsEventEnabled(ctx context.Context, event string) bool {
	return true
}

func TestProcessTrialExpiryGeneratesBillsForExpiredTrials(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}
	mockDiscord := &mockDiscordSender{}
	mockWA := &mockTrialWhatsAppSender{payloads: make(chan notifications.BillMessagePayload, 1)}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
		WhatsApp:   mockWA,
		Discord:    mockDiscord,
	}

	// Setup: Create package
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)

	// Create a trial-expired customer
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days, nomor_wa)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, "Trial Customer", 1, 8, "active", 1, expiredDate, 3, "6281234567890")
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	// Process trial expiry
	err = service.ProcessTrialExpiry(context.Background(), now)
	if err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	// Verify bill was generated
	var billCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM tagihan WHERE pelanggan_id = ?`, 1).Scan(&billCount)
	if err != nil {
		t.Fatalf("count bills: %v", err)
	}

	if billCount != 1 {
		t.Errorf("expected 1 bill to be generated, got %d", billCount)
	}

	// Verify trial was ended
	var isTrial int
	err = db.QueryRow(`SELECT is_trial FROM pelanggan WHERE id = ?`, 1).Scan(&isTrial)
	if err != nil {
		t.Fatalf("query customer: %v", err)
	}

	if isTrial != 0 {
		t.Errorf("expected is_trial to be 0, got %d", isTrial)
	}

	// Verify Discord notification was sent
	if len(mockDiscord.messages) == 0 {
		t.Error("expected Discord notification to be sent")
	}

	select {
	case payload := <-mockWA.payloads:
		if payload.TriggerKey != "jatuh_tempo" {
			t.Fatalf("expected jatuh_tempo trigger, got %q", payload.TriggerKey)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected 1 whatsapp payload, got none")
	}
}

func TestProcessTrialExpiryIgnoresNonTrialCustomers(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
	}

	// Setup: Create package
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	// Create a non-trial customer
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Non-Trial Customer", 1, 8, "active", 0, nil, 0)
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)

	// Process trial expiry
	err = service.ProcessTrialExpiry(context.Background(), now)
	if err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	// Verify no bill was generated
	var billCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM tagihan`).Scan(&billCount)
	if err != nil {
		t.Fatalf("count bills: %v", err)
	}

	if billCount != 0 {
		t.Errorf("expected no bills to be generated, got %d", billCount)
	}
}

func TestProcessTrialExpiryIgnoresActiveTrials(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
	}

	// Setup: Create package
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)

	// Create an active trial customer (trial not expired)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Active Trial Customer", 1, 8, "active", 1, now.Format(time.RFC3339), 3)
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	// Process trial expiry
	err = service.ProcessTrialExpiry(context.Background(), now)
	if err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	// Verify no bill was generated
	var billCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM tagihan`).Scan(&billCount)
	if err != nil {
		t.Fatalf("count bills: %v", err)
	}

	if billCount != 0 {
		t.Errorf("expected no bills to be generated for active trial, got %d", billCount)
	}

	// Verify trial is still active
	var isTrial int
	err = db.QueryRow(`SELECT is_trial FROM pelanggan WHERE id = ?`, 1).Scan(&isTrial)
	if err != nil {
		t.Fatalf("query customer: %v", err)
	}

	if isTrial == 0 {
		t.Error("expected customer to still be in trial")
	}
}

func TestProcessTrialExpiryMultipleCustomers(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}
	mockDiscord := &mockDiscordSender{}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
		Discord:    mockDiscord,
	}

	// Setup: Create package
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)

	// Create multiple trial-expired customers
	for i := 1; i <= 3; i++ {
		_, err = db.Exec(`
			INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days, nomor_wa)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, "Customer "+string(rune('0'+i)), 1, 8, "active", 1, expiredDate, 3, "6281234567890")
		if err != nil {
			t.Fatalf("insert customer: %v", err)
		}
	}

	// Process trial expiry
	err = service.ProcessTrialExpiry(context.Background(), now)
	if err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	// Verify bills were generated for all customers
	var billCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM tagihan`).Scan(&billCount)
	if err != nil {
		t.Fatalf("count bills: %v", err)
	}

	if billCount != 3 {
		t.Errorf("expected 3 bills to be generated, got %d", billCount)
	}

	// Verify all trials were ended
	var trialCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM pelanggan WHERE is_trial = 1`).Scan(&trialCount)
	if err != nil {
		t.Fatalf("count active trials: %v", err)
	}

	if trialCount != 0 {
		t.Errorf("expected all trials to be ended, got %d still active", trialCount)
	}
}

func TestProcessTrialExpiryDoesNotDuplicateExistingBill(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
	}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Test Paket', 20, 100000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days, nomor_wa)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 1, "Trial Customer", 1, 8, "active", 1, expiredDate, 3, "6281234567890")
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	_, err = db.Exec(`
		INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status)
		VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar')
	`, 1, 1, now.Format("2006-01"), "08-05-2026/1/20/001", 100000, "2026-05-08")
	if err != nil {
		t.Fatalf("insert existing bill: %v", err)
	}

	err = service.ProcessTrialExpiry(context.Background(), now)
	if err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	var billCount int
	err = db.QueryRow(`SELECT COUNT(1) FROM tagihan WHERE pelanggan_id = 1`).Scan(&billCount)
	if err != nil {
		t.Fatalf("count bills: %v", err)
	}
	if billCount != 1 {
		t.Fatalf("expected existing bill to be reused without duplication, got %d", billCount)
	}

	var isTrial int
	err = db.QueryRow(`SELECT is_trial FROM pelanggan WHERE id = 1`).Scan(&isTrial)
	if err != nil {
		t.Fatalf("query customer: %v", err)
	}
	if isTrial != 0 {
		t.Fatal("expected trial to be ended even when bill already exists")
	}
}

func TestProcessTrialExpirySkipsNotificationBeforeReminderWindow(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}
	mockWA := &mockTrialWhatsAppSender{payloads: make(chan notifications.BillMessagePayload, 1)}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
		WhatsApp:   mockWA,
	}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Test Paket', 20, 100000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC)
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days, nomor_wa)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 1, "Trial Early", 1, 10, "active", 1, expiredDate, 3, "6281234567890")
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	if err := service.ProcessTrialExpiry(context.Background(), now); err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	select {
	case payload := <-mockWA.payloads:
		t.Fatalf("expected no whatsapp notification before reminder window, got %q", payload.TriggerKey)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestProcessTrialExpiryUsesReminderTriggerInsideReminderWindow(t *testing.T) {
	db := trialTestDB(t)
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	customersService := customers.Service{Repository: customers.Repository{DB: db}}
	mockWA := &mockTrialWhatsAppSender{payloads: make(chan notifications.BillMessagePayload, 1)}

	service := Service{
		Repository: Repository{DB: db},
		Settings:   settingsService,
		Customers:  customersService,
		WhatsApp:   mockWA,
	}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Test Paket', 20, 100000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Date(2026, 5, 6, 10, 0, 0, 0, time.UTC)
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days, nomor_wa)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 1, "Trial Reminder", 1, 8, "active", 1, expiredDate, 3, "6281234567890")
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	if err := service.ProcessTrialExpiry(context.Background(), now); err != nil {
		t.Fatalf("process trial expiry: %v", err)
	}

	select {
	case payload := <-mockWA.payloads:
		if payload.TriggerKey != "reminder_custom" {
			t.Fatalf("expected reminder_custom trigger, got %q", payload.TriggerKey)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected reminder_custom notification, got none")
	}
}

func trialTestDB(t *testing.T) *sql.DB {
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
