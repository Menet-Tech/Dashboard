package database_test

import (
	"os"
	"path/filepath"
	"testing"

	"menettech/dashboard/backend/internal/platform/database"
)

func TestOpen(t *testing.T) {
	// Create a temp folder for the test db
	tmpDir, err := os.MkdirTemp("", "test-db-dir-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "subfolder", "app.db")

	t.Run("Open new database and auto-create folder structure", func(t *testing.T) {
		db, err := database.Open(dbPath)
		if err != nil {
			t.Fatalf("failed to open sqlite database: %v", err)
		}
		defer db.Close()

		// Verify connection is alive
		err = db.Ping()
		if err != nil {
			t.Errorf("db ping failed: %v", err)
		}

		// Verify PRAGMAs (WAL journal mode)
		var journalMode string
		err = db.QueryRow("PRAGMA journal_mode;").Scan(&journalMode)
		if err != nil {
			t.Fatalf("failed to query journal mode: %v", err)
		}
		if journalMode != "wal" {
			t.Errorf("expected journal mode 'wal', got %q", journalMode)
		}

		// Verify foreign keys enabled
		var foreignKeys int
		err = db.QueryRow("PRAGMA foreign_keys;").Scan(&foreignKeys)
		if err != nil {
			t.Fatalf("failed to query foreign keys: %v", err)
		}
		if foreignKeys != 1 {
			t.Errorf("expected foreign keys enabled (1), got %d", foreignKeys)
		}
	})

	t.Run("Open fails on invalid directory path", func(t *testing.T) {
		// Use a path where a file exists instead of a directory to cause MkdirAll to fail
		conflictFilePath := filepath.Join(tmpDir, "conflict_file")
		_ = os.WriteFile(conflictFilePath, []byte("plain text"), 0o644)

		invalidPath := filepath.Join(conflictFilePath, "app.db")
		_, err := database.Open(invalidPath)
		if err == nil {
			t.Error("expected database open to fail when parent dir creation is blocked by a file")
		}
	})
}
