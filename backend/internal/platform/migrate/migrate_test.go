package migrate_test

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestApplyMigrations(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	t.Run("Apply migrations first time", func(t *testing.T) {
		err := migrate.Apply(db)
		if err != nil {
			t.Fatalf("failed to apply migrations: %v", err)
		}

		// Verify schema_migrations table exists and has entries
		var count int
		err = db.QueryRow("SELECT COUNT(1) FROM schema_migrations").Scan(&count)
		if err != nil {
			t.Fatalf("failed to query schema_migrations: %v", err)
		}
		if count == 0 {
			t.Fatal("expected at least 1 migration to be recorded, got 0")
		}
	})

	t.Run("Apply migrations second time (idempotent)", func(t *testing.T) {
		err := migrate.Apply(db)
		if err != nil {
			t.Fatalf("failed to re-apply migrations: %v", err)
		}
	})
}
