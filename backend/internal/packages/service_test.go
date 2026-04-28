package packages

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestServiceCreateValidatesInput(t *testing.T) {
	service := Service{}

	_, err := service.Create(context.Background(), Package{
		Name:      "",
		SpeedMbps: 0,
		Price:     -1,
	})
	if err == nil {
		t.Fatal("expected validation error when creating invalid package")
	}
}

func TestServiceDeleteRejectsPackageInUse(t *testing.T) {
	db := packageTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
	}

	mustPackageExec(t, db, `INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home 20 Mbps', 20, 250000)`)
	mustPackageExec(t, db, `INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo, status) VALUES (1, 'Budi', 1, 8, 'active')`)

	err := service.Delete(context.Background(), 1)
	if !errors.Is(err, ErrPackageInUse) {
		t.Fatalf("expected package in use error, got %v", err)
	}
}

func packageTestDB(t *testing.T) *sql.DB {
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

func mustPackageExec(t *testing.T, db *sql.DB, query string) {
	t.Helper()

	if _, err := db.Exec(query); err != nil {
		t.Fatalf("exec query %q: %v", query, err)
	}
}
