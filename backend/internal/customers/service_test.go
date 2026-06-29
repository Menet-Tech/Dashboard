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

func TestReferralWithdrawals(t *testing.T) {
	db := customerTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	if err != nil {
		t.Fatalf("insert package: %v", err)
	}

	// Create customer with referral balance
	cust, err := service.Create(context.Background(), Customer{
		Name:      "Referral Cust",
		PackageID: 1,
		DueDay:    15,
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}

	// Add referral balance directly in DB
	_, err = db.Exec(`UPDATE pelanggan SET referral_balance = 100000 WHERE id = ?`, cust.ID)
	if err != nil {
		t.Fatalf("update referral balance: %v", err)
	}

	// Test 1: Successful withdraw request (Cash)
	withdrawID, err := service.WithdrawReferral(context.Background(), cust.ID, 50000, "cash", "")
	if err != nil {
		t.Fatalf("WithdrawReferral cash: %v", err)
	}
	if withdrawID == 0 {
		t.Fatal("expected non-zero withdraw ID")
	}

	// Verify balance is deducted
	c, _ := service.FindByID(context.Background(), cust.ID)
	if c.ReferralBalance != 50000 {
		t.Errorf("expected balance to be 50000, got %d", c.ReferralBalance)
	}

	// Verify withdrawal record
	wList, err := service.ListReferralWithdrawals(context.Background(), "pending")
	if err != nil {
		t.Fatalf("ListReferralWithdrawals: %v", err)
	}
	if len(wList) != 1 {
		t.Fatalf("expected 1 pending withdrawal, got %d", len(wList))
	}
	wRecord := wList[0]
	if wRecord.Amount != 50000 || wRecord.Method != "cash" || wRecord.Status != "pending" {
		t.Errorf("unexpected record data: %+v", wRecord)
	}

	// Test 2: Reject withdrawal and verify refund
	err = service.RejectReferralWithdrawal(context.Background(), withdrawID, "Data invalid")
	if err != nil {
		t.Fatalf("RejectReferralWithdrawal: %v", err)
	}

	// Verify balance is refunded
	c, _ = service.FindByID(context.Background(), cust.ID)
	if c.ReferralBalance != 100000 {
		t.Errorf("expected balance refunded to 100000, got %d", c.ReferralBalance)
	}

	// Verify status is updated
	wListAll, err := service.ListReferralWithdrawals(context.Background(), "")
	if err != nil {
		t.Fatalf("ListReferralWithdrawals: %v", err)
	}
	if len(wListAll) != 1 || wListAll[0].Status != "rejected" || wListAll[0].Notes != "Data invalid" {
		t.Errorf("unexpected list: %+v", wListAll)
	}

	// Test 3: Withdraw again and complete
	withdrawID2, err := service.WithdrawReferral(context.Background(), cust.ID, 50000, "transfer", "BCA 123456")
	if err != nil {
		t.Fatalf("WithdrawReferral transfer: %v", err)
	}

	err = service.CompleteReferralWithdrawal(context.Background(), withdrawID2, "uploads/proof.png", "Paid")
	if err != nil {
		t.Fatalf("CompleteReferralWithdrawal: %v", err)
	}

	// Verify balance remains deducted
	c, _ = service.FindByID(context.Background(), cust.ID)
	if c.ReferralBalance != 50000 {
		t.Errorf("expected balance to stay 50000, got %d", c.ReferralBalance)
	}

	// Verify record completed
	wListAll2, _ := service.ListReferralWithdrawals(context.Background(), "")
	var record2 *ReferralWithdrawal
	for _, rec := range wListAll2 {
		if rec.ID == withdrawID2 {
			record2 = &rec
			break
		}
	}
	if record2 == nil || record2.Status != "completed" || record2.ProofPath == nil || *record2.ProofPath != "uploads/proof.png" || record2.Notes != "Paid" {
		t.Errorf("unexpected completed record: %+v", record2)
	}

	// Test 4: Convert to voucher fails for special customers
	// First let's make customer special (diskon > 0)
	_, err = db.Exec(`UPDATE pelanggan SET diskon = 10000, tipe_diskon = 'flat' WHERE id = ?`, cust.ID)
	if err != nil {
		t.Fatalf("update special customer: %v", err)
	}

	err = service.ConvertReferralToVoucher(context.Background(), cust.ID, 50000)
	if err == nil {
		t.Fatal("expected convert voucher to fail for special customer")
	}
}
