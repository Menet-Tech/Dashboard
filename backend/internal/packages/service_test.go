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

func TestServiceCreateAndList(t *testing.T) {
	db := packageTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	pkg, err := service.Create(context.Background(), Package{
		Name:      "New Package",
		SpeedMbps: 50,
		Price:     350000,
	})
	if err != nil {
		t.Fatalf("create package: %v", err)
	}
	if pkg.ID == 0 {
		t.Fatal("expected assigned ID")
	}

	list, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("list packages: %v", err)
	}
	if len(list) != 1 || list[0].Name != "New Package" {
		t.Fatalf("expected 1 package named New Package, got %d", len(list))
	}
}

func TestServiceUpdateAndFind(t *testing.T) {
	db := packageTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	pkg, _ := service.Create(context.Background(), Package{
		Name:      "Old Name",
		SpeedMbps: 10,
		Price:     150000,
	})

	updated, err := service.Update(context.Background(), pkg.ID, Package{
		Name:      "Updated Name",
		SpeedMbps: 20,
		Price:     200000,
	})
	if err != nil {
		t.Fatalf("update package: %v", err)
	}
	if updated.Name != "Updated Name" {
		t.Fatalf("expected updated name")
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
