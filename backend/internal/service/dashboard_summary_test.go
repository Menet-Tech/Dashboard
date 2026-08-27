package service

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestDashboardSummaryServiceGet(t *testing.T) {
	db := newTestDatabase(t)

	mustExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)
	mustExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (2, 'Sari', 1, 12, 'limit')`)
	mustExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (3, 'Dina', 1, 20, 'inactive')`)
	mustExec(t, db, `INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1, 1, '2026-04', '27-04-2026/1/20/001', 250000, '2026-04-08', 'belum_bayar')`)
	mustExec(t, db, `INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (2, 1, '2026-04', '27-04-2026/2/20/001', 250000, '2026-04-12', 'lunas')`)

	summary, err := (&DashboardSummaryService{DB: db}).Get(context.Background())
	if err != nil {
		t.Fatalf("expected summary without error, got %v", err)
	}

	if summary.TotalPelanggan != 3 {
		t.Fatalf("expected 3 pelanggan, got %d", summary.TotalPelanggan)
	}

	if summary.TotalActive != 1 {
		t.Fatalf("expected 1 active pelanggan, got %d", summary.TotalActive)
	}

	if summary.TotalLimit != 1 {
		t.Fatalf("expected 1 limit pelanggan, got %d", summary.TotalLimit)
	}

	if summary.TotalInactive != 1 {
		t.Fatalf("expected 1 inactive pelanggan, got %d", summary.TotalInactive)
	}

	if summary.TotalTagihan != 1 {
		t.Fatalf("expected 1 unpaid bill, got %d", summary.TotalTagihan)
	}
}

func newTestDatabase(t *testing.T) *sql.DB {
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

func mustExec(t *testing.T, db *sql.DB, query string) {
	t.Helper()

	if _, err := db.Exec(query); err != nil {
		t.Fatalf("exec query %q: %v", query, err)
	}
}
