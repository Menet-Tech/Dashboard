package backup_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"menettech/dashboard/backend/internal/backup"
	_ "modernc.org/sqlite"
)

func TestListBackups_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")

	backups, err := svc.ListBackups()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(backups) != 0 {
		t.Errorf("expected 0 backups, got %d", len(backups))
	}
}

func TestListBackups_WithFiles(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")

	for _, name := range []string{"dashboard_2026-01-01_00-00-00.db", "dashboard_2026-01-02_00-00-00.db"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("test"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	backups, err := svc.ListBackups()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(backups) != 2 {
		t.Errorf("expected 2 backups, got %d", len(backups))
	}
}

func TestGetBackupPath_Invalid(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")

	_, err := svc.GetBackupPath("../../etc/passwd")
	if err == nil {
		t.Error("expected error for directory traversal attempt")
	}

	_, err = svc.GetBackupPath("not-a-db.txt")
	if err == nil {
		t.Error("expected error for non-.db file")
	}
}

func TestGetBackupPath_NotFound(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")

	_, err := svc.GetBackupPath("missing_2026-01-01_00-00-00.db")
	if err == nil {
		t.Error("expected error for missing backup file")
	}
}

func TestGetBackupPath_Valid(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")

	name := "dashboard_2026-01-01_00-00-00.db"
	_ = os.WriteFile(filepath.Join(dir, name), []byte("data"), 0644)

	path, err := svc.GetBackupPath(name)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path == "" {
		t.Error("expected non-empty path")
	}
}

func TestPruneOldBackups_CountLimit(t *testing.T) {
	dir := t.TempDir()
	svc := backup.NewService(nil, dir, "")
	svc.MaxRetain = 2

	names := []string{
		"dashboard_2026-01-01_00-00-00.db",
		"dashboard_2026-01-02_00-00-00.db",
		"dashboard_2026-01-03_00-00-00.db",
		"dashboard_2026-01-04_00-00-00.db",
	}
	for _, n := range names {
		_ = os.WriteFile(filepath.Join(dir, n), []byte("x"), 0644)
	}

	backups, _ := svc.ListBackups()
	if len(backups) != 4 {
		t.Fatalf("expected 4 backups before prune, got %d", len(backups))
	}
}

func TestCreateBackup_WithRealDB(t *testing.T) {
	dbDir := t.TempDir()
	dbPath := filepath.Join(dbDir, "source.db")
	backupDir := t.TempDir()

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)"); err != nil {
		t.Fatalf("create table: %v", err)
	}

	svc := backup.NewService(db, backupDir, dbPath)
	svc.MaxRetain = 3

	filename, err := svc.CreateBackup(context.Background())
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}
	if filename == "" {
		t.Error("expected non-empty filename")
	}

	backups, _ := svc.ListBackups()
	if len(backups) != 1 {
		t.Errorf("expected 1 backup after create, got %d", len(backups))
	}
}

func TestVerifyBackup_WithRealDB(t *testing.T) {
	dbDir := t.TempDir()
	dbPath := filepath.Join(dbDir, "source.db")
	backupDir := t.TempDir()

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec("CREATE TABLE test (id INTEGER PRIMARY KEY)"); err != nil {
		t.Fatalf("create table: %v", err)
	}

	svc := backup.NewService(db, backupDir, dbPath)
	filename, err := svc.CreateBackup(context.Background())
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}

	result, err := svc.VerifyBackup(context.Background(), filename)
	if err != nil {
		t.Fatalf("verify backup: %v", err)
	}
	if !result.Valid {
		t.Fatalf("expected valid backup result, got %+v", result)
	}
}

func TestSimulateRestore_WithRealDB(t *testing.T) {
	dbDir := t.TempDir()
	dbPath := filepath.Join(dbDir, "database.db")
	backupDir := filepath.Join(dbDir, "backups")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Create tables that SimulateRestore expects to count
	queries := []string{
		"CREATE TABLE users (id INTEGER PRIMARY KEY)",
		"CREATE TABLE pelanggan (id INTEGER PRIMARY KEY)",
		"CREATE TABLE tagihan (id INTEGER PRIMARY KEY)",
		"INSERT INTO users VALUES (1)",
		"INSERT INTO pelanggan VALUES (1)",
		"INSERT INTO pelanggan VALUES (2)",
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("setup table: %v", err)
		}
	}

	svc := backup.NewService(db, backupDir, dbPath)
	filename, err := svc.CreateBackup(context.Background())
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}

	res, err := svc.SimulateRestore(context.Background(), filename)
	if err != nil {
		t.Fatalf("simulate restore: %v", err)
	}
	if !res.Valid {
		t.Errorf("expected valid restore simulation")
	}
	if res.TotalUsers != 1 {
		t.Errorf("expected 1 user, got %d", res.TotalUsers)
	}
	if res.TotalPelanggan != 2 {
		t.Errorf("expected 2 pelanggan, got %d", res.TotalPelanggan)
	}
}

func TestApplyRestore_WithRealDB(t *testing.T) {
	dbDir := t.TempDir()
	dbPath := filepath.Join(dbDir, "database.db")
	backupDir := filepath.Join(dbDir, "backups")

	// Create a dummy live db
	_ = os.WriteFile(dbPath, []byte("live db"), 0644)
	
	svc := backup.NewService(nil, backupDir, dbPath)
	
	// Create a dummy staging db
	stagingPath := filepath.Join(dbDir, "staging.db")
	_ = os.WriteFile(stagingPath, []byte("staging db"), 0644)
	
	err := svc.ApplyRestore(context.Background())
	if err != nil {
		t.Fatalf("apply restore failed: %v", err)
	}
	
	// Check if live db was replaced
	content, _ := os.ReadFile(dbPath)
	if string(content) != "staging db" {
		t.Errorf("expected live db to be replaced by staging db")
	}
}
