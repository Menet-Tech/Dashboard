package backup

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type RestoreSimulationResult struct {
	Valid          bool   `json:"valid"`
	Message        string `json:"message"`
	TotalUsers     int    `json:"total_users"`
	TotalPelanggan int    `json:"total_pelanggan"`
	TotalTagihan   int    `json:"total_tagihan"`
}

func (s *Service) getStagingPath() string {
	// Let's put staging.db in the parent directory of BackupDir (which is storage)
	storageDir := filepath.Dir(s.BackupDir)
	return filepath.Join(storageDir, "staging.db")
}

func (s *Service) getLiveDbPath() string {
	storageDir := filepath.Dir(s.BackupDir)
	return filepath.Join(storageDir, "database.db")
}

// SimulateRestore copies a backup to staging.db, runs integrity checks, and counts records
func (s *Service) SimulateRestore(ctx context.Context, filename string) (RestoreSimulationResult, error) {
	backupPath, err := s.GetBackupPath(filename)
	if err != nil {
		return RestoreSimulationResult{}, err
	}

	stagingPath := s.getStagingPath()

	// Copy backup to staging
	if err := copyFile(backupPath, stagingPath); err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("copy backup to staging: %w", err)
	}

	// Open staging DB to verify
	db, err := sql.Open("sqlite", stagingPath)
	if err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("open staging db: %w", err)
	}
	defer db.Close()

	// Check integrity
	var integrity string
	if err := db.QueryRowContext(ctx, `PRAGMA integrity_check;`).Scan(&integrity); err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("integrity check: %w", err)
	}

	valid := strings.EqualFold(strings.TrimSpace(integrity), "ok")
	if !valid {
		return RestoreSimulationResult{
			Valid:   false,
			Message: fmt.Sprintf("Integrity check failed: %s", integrity),
		}, nil
	}

	// Count some stats to show the user what they are restoring
	var result RestoreSimulationResult
	result.Valid = true
	result.Message = "Staging database is healthy"

	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&result.TotalUsers)
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pelanggan").Scan(&result.TotalPelanggan)
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tagihan").Scan(&result.TotalTagihan)

	return result, nil
}

// ApplyRestore replaces the live database with staging.db. 
// Note: This function will copy the file, and then the caller should restart the application.
func (s *Service) ApplyRestore(ctx context.Context) error {
	stagingPath := s.getStagingPath()
	if _, err := os.Stat(stagingPath); os.IsNotExist(err) {
		return fmt.Errorf("staging database not found, run simulate first")
	}

	livePath := s.getLiveDbPath()

	// Wait for any pending SQLite writes (best effort)
	time.Sleep(500 * time.Millisecond)

	// In a real production scenario, replacing a SQLite db file while it is open 
	// can cause issues. The safest way is to copy the staging file over the live file,
	// and then forcefully restart the Go application so it re-opens the new file.
	if err := copyFile(stagingPath, livePath); err != nil {
		return fmt.Errorf("failed to replace live database: %w", err)
	}

	return nil
}

func copyFile(src, dst string) error {
	sourceFileStat, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !sourceFileStat.Mode().IsRegular() {
		return fmt.Errorf("%s is not a regular file", src)
	}

	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destination.Close()
	
	if _, err := io.Copy(destination, source); err != nil {
		return err
	}
	return nil
}
