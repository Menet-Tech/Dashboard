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
