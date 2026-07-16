package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite directory: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enable sqlite foreign keys: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode = WAL;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enable sqlite wal mode: %w", err)
	}

	if _, err := db.Exec("PRAGMA busy_timeout = 15000;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite busy timeout: %w", err)
	}

	// Memory optimizations for low-RAM environments (512MB VPS).
	// cache_size: negative value = KiB; -2000 = 2MB (vs default ~8MB).
	if _, err := db.Exec("PRAGMA cache_size = -2000;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite cache size: %w", err)
	}

	// NORMAL is safe with WAL and avoids extra fsync overhead.
	if _, err := db.Exec("PRAGMA synchronous = NORMAL;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite synchronous: %w", err)
	}

	// Keep temp tables in memory to avoid temp-file I/O.
	if _, err := db.Exec("PRAGMA temp_store = MEMORY;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite temp store: %w", err)
	}

	// Checkpoint WAL every 100 pages (~400KB) to prevent WAL file from growing.
	if _, err := db.Exec("PRAGMA wal_autocheckpoint = 100;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite wal autocheckpoint: %w", err)
	}

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}

	return db, nil
}
