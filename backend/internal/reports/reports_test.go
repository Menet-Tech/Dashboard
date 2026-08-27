package reports_test

import (
	"bytes"
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/reports"
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
		CREATE TABLE paket (
			id INTEGER PRIMARY KEY,
			nama TEXT NOT NULL
		);
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY,
			nama TEXT NOT NULL,
			paket_id INTEGER REFERENCES paket(id),
			user_pppoe TEXT,
			nomor_wa TEXT,
			sn_ont TEXT,
			tgl_jatuh_tempo INTEGER,
			status TEXT,
			alamat TEXT,
			referral_balance INTEGER DEFAULT 0,
			diskon INTEGER DEFAULT 0,
			tipe_diskon TEXT DEFAULT 'flat'
		);
		CREATE TABLE tagihan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pelanggan_id INTEGER REFERENCES pelanggan(id),
			paket_id INTEGER REFERENCES paket(id),
			periode TEXT NOT NULL,
			invoice_number TEXT NOT NULL,
			nominal INTEGER NOT NULL,
			jatuh_tempo TEXT NOT NULL,
			status TEXT NOT NULL,
			paid_at DATETIME,
			payment_method TEXT,
			proof_path TEXT
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestReportsService(t *testing.T) {
	db := setupTestDB(t)
	svc := reports.Service{DB: db}
	ctx := context.Background()

	// Seed reference data
	_, _ = db.Exec(`INSERT INTO paket (id, nama) VALUES (1, 'Premium Plan')`)
	_, _ = db.Exec(`INSERT INTO pelanggan (id, nama, paket_id, user_pppoe, nomor_wa, status, tgl_jatuh_tempo) VALUES (10, 'Irfan', 1, 'irfan_user', '6281', 'active', 5)`)

	t.Run("MonthlyRevenue", func(t *testing.T) {
		// Insert bills for revenue computation
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-06', 'INV-06', 150000, '2026-06-05', 'lunas')`)
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-05', 'INV-05', 150000, '2026-05-05', 'belum_bayar')`)

		items, err := svc.MonthlyRevenue(ctx, 12)
		if err != nil {
			t.Fatalf("failed to calculate monthly revenue: %v", err)
		}

		if len(items) != 2 {
			t.Fatalf("expected 2 monthly items, got %d", len(items))
		}

		// Items sorted by period desc: 2026-06 first
		if items[0].Period != "2026-06" || items[0].TotalPaid != 150000 {
			t.Errorf("unexpected calculation for period 2026-06: %+v", items[0])
		}
		if items[1].Period != "2026-05" || items[1].TotalPaid != 0 {
			t.Errorf("unexpected calculation for period 2026-05: %+v", items[1])
		}
	})

	t.Run("Aging Report", func(t *testing.T) {
		// Clean up existing unpaid bills to control results
		_, _ = db.Exec("DELETE FROM tagihan")

		// Insert unpaid bills with relative due dates to matching categories:
		// category 1: current (due date >= now)
		todayStr := time.Now().Format("2006-01-02")
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-06', 'INV-CURR', 100000, ?, 'belum_bayar')`, todayStr)

		// category 2: 1-30 days overdue (due date < now and >= now - 30 days)
		overdue10Days := time.Now().AddDate(0, 0, -10).Format("2006-01-02")
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-06', 'INV-OD10', 200000, ?, 'belum_bayar')`, overdue10Days)

		// category 3: 31-60 days overdue
		overdue40Days := time.Now().AddDate(0, 0, -40).Format("2006-01-02")
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-05', 'INV-OD40', 300000, ?, 'belum_bayar')`, overdue40Days)

		// category 4: > 60 days overdue
		overdue70Days := time.Now().AddDate(0, 0, -70).Format("2006-01-02")
		_, _ = db.Exec(`INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (10, 1, '2026-04', 'INV-OD70', 400000, ?, 'belum_bayar')`, overdue70Days)

		report, err := svc.Aging(ctx)
		if err != nil {
			t.Fatalf("failed to calculate aging report: %v", err)
		}

		if report.Current != 100000 {
			t.Errorf("expected Current = 100000, got %f", report.Current)
		}
		if report.Days1_30 != 200000 {
			t.Errorf("expected Days1_30 = 200000, got %f", report.Days1_30)
		}
		if report.Days31_60 != 300000 {
			t.Errorf("expected Days31_60 = 300000, got %f", report.Days31_60)
		}
		if report.Over60 != 400000 {
			t.Errorf("expected Over60 = 400000, got %f", report.Over60)
		}
	})

	t.Run("Export CSVs", func(t *testing.T) {
		// Verify ExportBillsCSV writes CSV data
		var bufBills bytes.Buffer
		err := svc.ExportBillsCSV(ctx, &bufBills)
		if err != nil {
			t.Fatalf("failed to export bills CSV: %v", err)
		}
		if bufBills.Len() == 0 {
			t.Error("expected CSV output, got empty buffer")
		}

		// Verify ExportCustomersCSV writes CSV data
		var bufCustomers bytes.Buffer
		err = svc.ExportCustomersCSV(ctx, &bufCustomers)
		if err != nil {
			t.Fatalf("failed to export customers CSV: %v", err)
		}
		if bufCustomers.Len() == 0 {
			t.Error("expected CSV output, got empty buffer")
		}
	})
}
