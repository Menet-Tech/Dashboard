package vouchers_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/vouchers"
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
		CREATE TABLE vouchers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT UNIQUE NOT NULL,
			amount INTEGER NOT NULL,
			type TEXT NOT NULL,
			total_cycles INTEGER NOT NULL,
			description TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			diskon INTEGER DEFAULT 0,
			voucher_auto_apply INTEGER DEFAULT 0,
			updated_at DATETIME
		);
		CREATE TABLE customer_vouchers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id),
			voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
			remaining_cycles INTEGER NOT NULL,
			status TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME
		);
		CREATE TABLE tagihan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			invoice_number TEXT UNIQUE NOT NULL
		);
		CREATE TABLE voucher_usage_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id),
			voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
			tagihan_id INTEGER NOT NULL REFERENCES tagihan(id),
			amount_applied INTEGER NOT NULL,
			cycle_number INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestVoucherService(t *testing.T) {
	db := setupTestDB(t)
	repo := vouchers.Repository{DB: db}
	svc := vouchers.Service{Repository: repo}
	ctx := context.Background()

	// Seed some test customers
	_, _ = db.Exec("INSERT INTO pelanggan (nama, diskon) VALUES ('Regular User', 0)")
	_, _ = db.Exec("INSERT INTO pelanggan (nama, diskon) VALUES ('Special User', 50000)")

	t.Run("Create Voucher - Validation errors", func(t *testing.T) {
		_, err := svc.Create(ctx, vouchers.Voucher{Code: "", Amount: 10000, Type: "one-time"})
		if err == nil {
			t.Fatal("expected error with empty code")
		}

		_, err = svc.Create(ctx, vouchers.Voucher{Code: "PROMO", Amount: 0, Type: "one-time"})
		if err == nil {
			t.Fatal("expected error with zero amount")
		}

		_, err = svc.Create(ctx, vouchers.Voucher{Code: "PROMO", Amount: 10000, Type: "invalid-type"})
		if err == nil {
			t.Fatal("expected error with invalid type")
		}
	})

	t.Run("Create Voucher - Success", func(t *testing.T) {
		v, err := svc.Create(ctx, vouchers.Voucher{
			Code:        "diskon20",
			Amount:      20000,
			Type:        "one-time",
			Description: "Potongan 20rb",
		})
		if err != nil {
			t.Fatalf("failed to create voucher: %v", err)
		}
		if v.ID == 0 {
			t.Fatal("expected non-zero ID")
		}
		if v.Code != "DISKON20" {
			t.Errorf("expected capitalized code, got %q", v.Code)
		}
	})

	t.Run("Claim Voucher - Validations and Success", func(t *testing.T) {
		// Claim non-existent code
		_, err := svc.Claim(ctx, 1, "NON_EXISTENT")
		if !errors.Is(err, vouchers.ErrVoucherNotFound) {
			t.Errorf("expected ErrVoucherNotFound, got %v", err)
		}

		// Claim by special user (should fail)
		_, err = svc.Claim(ctx, 2, "DISKON20")
		if err == nil {
			t.Fatal("expected error when special user claims voucher")
		}

		// Claim by regular user (should succeed)
		cv, err := svc.Claim(ctx, 1, "DISKON20")
		if err != nil {
			t.Fatalf("failed to claim voucher: %v", err)
		}
		if cv.Status != "active" {
			t.Errorf("expected status 'active', got %q", cv.Status)
		}

		// Claim again while active voucher exists (should fail)
		_, err = svc.Claim(ctx, 1, "DISKON20")
		if !errors.Is(err, vouchers.ErrAlreadyHasActiveVoucher) {
			t.Errorf("expected ErrAlreadyHasActiveVoucher, got %v", err)
		}
	})

	t.Run("ToggleAutoApply", func(t *testing.T) {
		err := svc.ToggleAutoApply(ctx, 1, true)
		if err != nil {
			t.Fatalf("failed to toggle auto apply: %v", err)
		}

		var autoApply int
		_ = db.QueryRow("SELECT voucher_auto_apply FROM pelanggan WHERE id = 1").Scan(&autoApply)
		if autoApply != 1 {
			t.Errorf("expected auto apply to be 1, got %d", autoApply)
		}
	})

	t.Run("ListActiveCustomerVouchers", func(t *testing.T) {
		list, err := svc.ListActiveCustomerVouchers(ctx)
		if err != nil {
			t.Fatalf("failed to list active vouchers: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 active voucher, got %d", len(list))
		}
		if list[0].CustomerName != "Regular User" {
			t.Errorf("expected customer name 'Regular User', got %q", list[0].CustomerName)
		}
	})

	t.Run("ListUsageLogs", func(t *testing.T) {
		// Mock a bill and a log entry
		_, _ = db.Exec("INSERT INTO tagihan (id, invoice_number) VALUES (100, 'INV-100')")
		_, _ = db.Exec("INSERT INTO voucher_usage_logs (pelanggan_id, voucher_id, tagihan_id, amount_applied, cycle_number) VALUES (1, 1, 100, 20000, 1)")

		logs, err := svc.ListUsageLogs(ctx)
		if err != nil {
			t.Fatalf("failed to list usage logs: %v", err)
		}
		if len(logs) != 1 {
			t.Fatalf("expected 1 log, got %d", len(logs))
		}
		if logs[0].InvoiceNumber != "INV-100" {
			t.Errorf("expected invoice 'INV-100', got %q", logs[0].InvoiceNumber)
		}
	})

	t.Run("Delete Voucher", func(t *testing.T) {
		// Create a new voucher to delete
		v, _ := svc.Create(ctx, vouchers.Voucher{Code: "DELETE_ME", Amount: 5000, Type: "permanent"})

		err := svc.Delete(ctx, v.ID)
		if err != nil {
			t.Fatalf("failed to delete voucher: %v", err)
		}

		// Verify deletion
		err = svc.Delete(ctx, v.ID)
		if !errors.Is(err, vouchers.ErrVoucherNotFound) {
			t.Errorf("expected ErrVoucherNotFound, got %v", err)
		}
	})
}
