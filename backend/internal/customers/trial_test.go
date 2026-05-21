package customers

import (
	"context"
	"testing"
	"time"

	_ "modernc.org/sqlite"
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
