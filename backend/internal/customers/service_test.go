package customers

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestServiceCreateValidatesDueDayAndStatus(t *testing.T) {
	service := Service{}

	_, err := service.Create(context.Background(), Customer{
		Name:      "Budi",
		PackageID: 1,
		DueDay:    40,
		Status:    "active",
	})
	if err == nil {
		t.Fatal("expected due day validation error")
	}

	_, err = service.Create(context.Background(), Customer{
		Name:      "Budi",
		PackageID: 1,
		DueDay:    8,
		Status:    "broken",
	})
	if err == nil {
		t.Fatal("expected status validation error")
	}
}

func TestServiceCreateRequiresExistingPackage(t *testing.T) {
	db := customerTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	_, err := service.Create(context.Background(), Customer{
		Name:      "Budi",
		PackageID: 999,
		DueDay:    8,
		Status:    "active",
	})
	if err == nil {
		t.Fatal("expected create to fail when package does not exist")
	}
}

func TestServiceCreateUpdateList(t *testing.T) {
	db := customerTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	cust, err := service.Create(context.Background(), Customer{
		Name:      "Test Cust",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
		TrialDays: 5,
	})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}
	if cust.ID == 0 {
		t.Fatal("expected assigned ID")
	}
	if !cust.IsTrial {
		t.Fatal("expected customer to be created as trial by default")
	}

	updated, err := service.Update(context.Background(), cust.ID, Customer{
		Name:      "Updated Cust",
		PackageID: 1,
		DueDay:    10,
		Status:    "inactive",
	})
	if err != nil {
		t.Fatalf("update customer: %v", err)
	}
	if updated.Name != "Updated Cust" {
		t.Fatal("expected updated name")
	}

	list, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("list customers: %v", err)
	}
	if len(list) != 1 || list[0].Name != "Updated Cust" {
		t.Fatalf("expected list to contain updated customer, got len=%d", len(list))
	}
}

func TestServiceUpdateStatus(t *testing.T) {
	db := customerTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	cust, err := service.Create(context.Background(), Customer{
		Name:      "Test Cust",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}

	if err := service.UpdateStatus(context.Background(), cust.ID, "limit"); err != nil {
		t.Fatalf("update status: %v", err)
	}

	list, _ := service.List(context.Background())
	if list[0].Status != "limit" {
		t.Fatalf("expected status limit, got %q", list[0].Status)
	}

	if err := service.UpdateStatus(context.Background(), cust.ID, "invalid_status"); err == nil {
		t.Fatal("expected error for invalid status")
	}
}

func TestCustomerEmailSaveAndRetrieve(t *testing.T) {
	db := customerTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	// Create with Email
	cust, err := service.Create(context.Background(), Customer{
		Name:      "Email Cust",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
		Email:     "cust@gmail.com",
	})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}

	if cust.Email != "cust@gmail.com" {
		t.Errorf("expected email to be cust@gmail.com, got %q", cust.Email)
	}

	// Retrieve list and check email
	list, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("list customers: %v", err)
	}
	if len(list) != 1 || list[0].Email != "cust@gmail.com" {
		t.Errorf("expected retrieved email to be cust@gmail.com, got %q", list[0].Email)
	}

	// Update email
	_, err = service.Update(context.Background(), cust.ID, Customer{
		Name:      "Email Cust",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
		Email:     "newemail@gmail.com",
	})
	if err != nil {
		t.Fatalf("update customer: %v", err)
	}

	// Retrieve again and verify update
	list2, _ := service.List(context.Background())
	if list2[0].Email != "newemail@gmail.com" {
		t.Errorf("expected updated email to be newemail@gmail.com, got %q", list2[0].Email)
	}
}

func customerTestDB(t *testing.T) *sql.DB {
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
