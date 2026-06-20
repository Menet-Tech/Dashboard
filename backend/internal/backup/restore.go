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
	if s.LiveDBPath != "" {
		return s.LiveDBPath
	}
	// Fallback: derive from BackupDir parent (legacy behaviour)
	storageDir := filepath.Dir(s.BackupDir)
	return filepath.Join(storageDir, "dashboard.db")
}

// SimulateRestore copies a backup to staging.db, runs integrity checks, and counts records
func (s *Service) SimulateRestore(ctx context.Context, filename string) (RestoreSimulationResult, error) {
	backupPath, err := s.GetBackupPath(filename)
	if err != nil {
		return RestoreSimulationResult{}, err
	}

	stagingPath := s.getStagingPath()

	// Clean any existing staging file before copying
	_ = os.Remove(stagingPath)

	// Copy backup to staging
	if err := copyFile(backupPath, stagingPath); err != nil {
		_ = os.Remove(stagingPath) // clean up on failure
		return RestoreSimulationResult{}, fmt.Errorf("copy backup to staging: %w", err)
	}

	// Open staging DB to verify
	db, err := sql.Open("sqlite", stagingPath)
	if err != nil {
		_ = os.Remove(stagingPath) // clean up on failure
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

	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&result.TotalUsers); err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("count users in staging: %w", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pelanggan").Scan(&result.TotalPelanggan); err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("count pelanggan in staging: %w", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tagihan").Scan(&result.TotalTagihan); err != nil {
		return RestoreSimulationResult{}, fmt.Errorf("count tagihan in staging: %w", err)
	}

	// Staging file is intentionally kept — ApplyRestore will use it
	return result, nil
}

// ApplyRestore replaces the live database with staging.db.
// It creates a timestamped backup of the current live DB first, then replaces it.
// Note: After this call, the caller should restart the application so it re-opens the new file.
func (s *Service) ApplyRestore(ctx context.Context) error {
	stagingPath := s.getStagingPath()
	if _, err := os.Stat(stagingPath); os.IsNotExist(err) {
		return fmt.Errorf("staging database not found, run simulate first")
	}

	livePath := s.getLiveDbPath()

	// Create a timestamped backup of the current live database BEFORE replacing it
	backupPath := livePath + ".pre-restore-" + time.Now().UTC().Format("20060102-150405") + ".bak"
	if err := copyFile(livePath, backupPath); err != nil {
		return fmt.Errorf("failed to backup current database before restore: %w", err)
	}

	// Replace live database with staging
	if err := copyFile(stagingPath, livePath); err != nil {
		// Attempt to recover from the backup
		if recoverErr := copyFile(backupPath, livePath); recoverErr != nil {
			return fmt.Errorf("restore failed AND recovery failed: restore=%w, recovery=%v", err, recoverErr)
		}
		return fmt.Errorf("restore failed but database recovered from backup: %w", err)
	}

	// Clean up the pre-restore backup after successful replace
	_ = os.Remove(backupPath)

	return nil
}

// CleanupStaging removes the staging database file if it exists.
func (s *Service) CleanupStaging() error {
	stagingPath := s.getStagingPath()
	if err := os.Remove(stagingPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("cleanup staging db: %w", err)
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
