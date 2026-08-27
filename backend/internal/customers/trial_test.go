package customers

import (
	"context"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/settings"
)

func TestServiceCreateInitializesTrialPeriod(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	// Create package first
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	// Create customer
	customer, err := service.Create(context.Background(), Customer{
		Name:      "Test Customer",
		PackageID: 1,
		DueDay:    8,
		Status:    "active",
		WhatsApp:  "6281234567890",
		Address:   "Jl. Test",
	})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}

	// Verify trial is set
	if !customer.IsTrial {
		t.Error("expected customer to be in trial")
	}

	if customer.TrialDays != 3 {
		t.Errorf("expected trial days to be 3, got %d", customer.TrialDays)
	}

	if customer.TrialStartedAt == nil {
		t.Error("expected trial_started_at to be set")
	}
}

func TestListTrialExpiredReturnsOnlyExpiredCustomers(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	// Setup: Create package and customers
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Now().UTC()

	// Create an active trial customer (not expired)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Active Trial", 1, 8, "active", 1, now.Format(time.RFC3339), 3)
	if err != nil {
		t.Fatalf("insert active trial customer: %v", err)
	}

	// Create an expired trial customer (trial ended 1 day ago)
	expiredDate := now.AddDate(0, 0, -4).Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Expired Trial", 1, 8, "active", 1, expiredDate, 3)
	if err != nil {
		t.Fatalf("insert expired trial customer: %v", err)
	}

	// Create a non-trial customer
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Non-Trial", 1, 8, "active", 0, nil, 3)
	if err != nil {
		t.Fatalf("insert non-trial customer: %v", err)
	}

	// Get expired trials
	expired, err := service.ListTrialExpired(context.Background(), time.Now().UTC())
	if err != nil {
		t.Fatalf("list trial expired: %v", err)
	}

	// Should only return 1 expired customer
	if len(expired) != 1 {
		t.Errorf("expected 1 expired trial, got %d", len(expired))
	}

	if len(expired) > 0 && expired[0].Name != "Expired Trial" {
		t.Errorf("expected expired customer to be 'Expired Trial', got %q", expired[0].Name)
	}
}

func TestEndTrialMarksTrialAsComplete(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	// Setup: Create package and customer
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Test Customer", 1, 8, "active", 1, now, 3)
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	// End trial
	err = service.EndTrial(context.Background(), 1)
	if err != nil {
		t.Fatalf("end trial: %v", err)
	}

	// Verify trial is ended
	var isTrial int
	err = db.QueryRow(`SELECT is_trial FROM pelanggan WHERE id = ?`, 1).Scan(&isTrial)
	if err != nil {
		t.Fatalf("query customer: %v", err)
	}

	if isTrial != 0 {
		t.Errorf("expected is_trial to be 0 (false), got %d", isTrial)
	}
}

func TestEndTrialReturnsErrorForNonexistentCustomer(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	err := service.EndTrial(context.Background(), 999)
	if err != ErrCustomerNotFound {
		t.Errorf("expected ErrCustomerNotFound, got %v", err)
	}
}

func TestTrialFieldsInList(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	// Setup: Create package and customer
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, status, is_trial, trial_started_at, trial_days)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "Trial Customer", 1, 8, "active", 1, now, 3)
	if err != nil {
		t.Fatalf("insert customer: %v", err)
	}

	// List customers
	customers, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("list customers: %v", err)
	}

	if len(customers) != 1 {
		t.Fatalf("expected 1 customer, got %d", len(customers))
	}

	cust := customers[0]
	if !cust.IsTrial {
		t.Error("expected customer to be in trial")
	}

	if cust.TrialDays != 3 {
		t.Errorf("expected trial days to be 3, got %d", cust.TrialDays)
	}

	if cust.TrialStartedAt == nil {
		t.Error("expected trial_started_at to be set")
	}
}

func TestServiceCreateRespectsTrialSettings(t *testing.T) {
	db := customerTestDB(t)
	
	// Create package first
	_, err := db.Exec(`INSERT INTO paket (nama, kecepatan_mbps, harga) VALUES (?, ?, ?)`, "Test Paket", 20, 100000)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	// 1. Test when trial is enabled (trial_enabled = "1" or default)
	serviceEnabled := Service{
		Repository: Repository{DB: db},
		Settings: settings.Service{
			Repository: settings.Repository{DB: db},
		},
	}

	// Make sure setting is explicitly set to "1"
	err = serviceEnabled.Settings.Set(context.Background(), "trial_enabled", "1")
	if err != nil {
		t.Fatalf("set trial_enabled setting: %v", err)
	}
	err = serviceEnabled.Settings.Set(context.Background(), "trial_period_days", "5")
	if err != nil {
		t.Fatalf("set trial_period_days setting: %v", err)
	}

	customerEnabled, err := serviceEnabled.Create(context.Background(), Customer{
		Name:      "Trial Enabled Customer",
		PackageID: 1,
		DueDay:    8,
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("create enabled customer: %v", err)
	}

	if !customerEnabled.IsTrial {
		t.Error("expected customer to be in trial mode")
	}
	if customerEnabled.TrialDays != 5 {
		t.Errorf("expected trial days to be 5, got %d", customerEnabled.TrialDays)
	}
	if customerEnabled.TrialStartedAt == nil {
		t.Error("expected trial started at to be set")
	}

	// 2. Test when trial is disabled (trial_enabled = "0")
	serviceDisabled := Service{
		Repository: Repository{DB: db},
		Settings: settings.Service{
			Repository: settings.Repository{DB: db},
		},
	}

	err = serviceDisabled.Settings.Set(context.Background(), "trial_enabled", "0")
	if err != nil {
		t.Fatalf("set trial_enabled setting to 0: %v", err)
	}

	customerDisabled, err := serviceDisabled.Create(context.Background(), Customer{
		Name:      "Trial Disabled Customer",
		PackageID: 1,
		DueDay:    8,
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("create disabled customer: %v", err)
	}

	if customerDisabled.IsTrial {
		t.Error("expected customer to NOT be in trial mode")
	}
	if customerDisabled.TrialDays != 0 {
		t.Errorf("expected trial days to be 0, got %d", customerDisabled.TrialDays)
	}
	if customerDisabled.TrialStartedAt != nil {
		t.Errorf("expected trial started at to be nil, got %s", *customerDisabled.TrialStartedAt)
	}

	// Check DB row directly
	var isTrial, trialDays int
	var trialStartedAt *string
	err = db.QueryRow(`SELECT is_trial, trial_days, trial_started_at FROM pelanggan WHERE id = ?`, customerDisabled.ID).Scan(&isTrial, &trialDays, &trialStartedAt)
	if err != nil {
		t.Fatalf("query customerDisabled from DB: %v", err)
	}
	if isTrial != 0 {
		t.Errorf("expected DB column is_trial to be 0, got %d", isTrial)
	}
	if trialDays != 0 {
		t.Errorf("expected DB column trial_days to be 0, got %d", trialDays)
	}
	if trialStartedAt != nil {
		t.Errorf("expected DB column trial_started_at to be NULL, got %s", *trialStartedAt)
	}
}

func TestServiceCreateRespectsSkipTrialActivationContext(t *testing.T) {
	db := customerTestDB(t)
	defer db.Close()

	service := Service{
		Repository: Repository{DB: db},
		Settings: settings.Service{
			Repository: settings.Repository{DB: db},
		},
	}

	// 1. Enable trials globally in settings
	err := service.Settings.Set(context.Background(), "trial_enabled", "1")
	if err != nil {
		t.Fatalf("set trial_enabled setting to 1: %v", err)
	}

	// Create a package
	_, err = db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga, deskripsi) VALUES (1, 'Test Package', 10, 100000, '')`)
	if err != nil {
		t.Fatalf("failed to insert test package: %v", err)
	}

	// 2. Create customer with skip_trial_activation set to true in context
	ctx := context.WithValue(context.Background(), "skip_trial_activation", true)
	cust, err := service.Create(ctx, Customer{
		Name:      "Imported Non-Trial Customer",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("failed to create customer: %v", err)
	}

	// 3. Verify customer is NOT in trial mode
	if cust.IsTrial {
		t.Error("expected customer to NOT be in trial mode since skip_trial_activation context key was true")
	}
	if cust.Status != "active" {
		t.Errorf("expected status to remain 'active', got %s", cust.Status)
	}
	if cust.TrialDays != 0 {
		t.Errorf("expected trial days to be 0, got %d", cust.TrialDays)
	}
	if cust.TrialStartedAt != nil {
		t.Errorf("expected trial started at to be nil, got %s", *cust.TrialStartedAt)
	}
}
