package backup

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type BackupInfo struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	ModTime  string `json:"mod_time"`
}

type VerificationResult struct {
	Filename  string `json:"filename"`
	Valid     bool   `json:"valid"`
	Message   string `json:"message"`
	CheckedAt string `json:"checked_at"`
}

type Service struct {
	DB        *sql.DB
	BackupDir string
	MaxRetain int
}

func NewService(db *sql.DB, backupDir string) *Service {
	return &Service{
		DB:        db,
		BackupDir: backupDir,
		MaxRetain: 7, // retain last 7 backups by default
	}
}

func (s *Service) CreateBackup(ctx context.Context) (string, error) {
	if err := os.MkdirAll(s.BackupDir, 0755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}

	timestamp := time.Now().UTC().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("dashboard_%s.db", timestamp)
	backupPath := filepath.Join(s.BackupDir, filename)

	// Use SQLite VACUUM INTO for a safe online backup
	query := fmt.Sprintf("VACUUM INTO '%s'", backupPath)
	if _, err := s.DB.ExecContext(ctx, query); err != nil {
		return "", fmt.Errorf("execute vacuum into: %w", err)
	}

	if err := s.pruneOldBackups(); err != nil {
		// Log error but don't fail the backup
		fmt.Printf("Warning: failed to prune old backups: %v\n", err)
	}

	return filename, nil
}

func (s *Service) ListBackups() ([]BackupInfo, error) {
	if err := os.MkdirAll(s.BackupDir, 0755); err != nil {
		return nil, fmt.Errorf("create backup dir: %w", err)
	}

	entries, err := os.ReadDir(s.BackupDir)
	if err != nil {
		return nil, fmt.Errorf("read backup dir: %w", err)
	}

	var backups []BackupInfo
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".db" {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		backups = append(backups, BackupInfo{
			Filename: entry.Name(),
			Size:     info.Size(),
			ModTime:  info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	// Sort newest first
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].ModTime > backups[j].ModTime
	})

	return backups, nil
}

func (s *Service) GetBackupPath(filename string) (string, error) {
	if filepath.Ext(filename) != ".db" {
		return "", fmt.Errorf("invalid backup filename")
	}
	// Basic directory traversal protection
	if filename != filepath.Base(filename) {
		return "", fmt.Errorf("invalid backup filename")
	}

	path := filepath.Join(s.BackupDir, filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return "", fmt.Errorf("backup not found")
	}

	return path, nil
}

func (s *Service) VerifyBackup(ctx context.Context, filename string) (VerificationResult, error) {
	path, err := s.GetBackupPath(filename)
	if err != nil {
		return VerificationResult{}, err
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return VerificationResult{}, fmt.Errorf("open backup db: %w", err)
	}
	defer db.Close()

	row := db.QueryRowContext(ctx, `PRAGMA integrity_check;`)
	var integrity string
	if err := row.Scan(&integrity); err != nil {
		return VerificationResult{}, fmt.Errorf("integrity check: %w", err)
	}

	result := VerificationResult{
		Filename:  filename,
		Valid:     strings.EqualFold(strings.TrimSpace(integrity), "ok"),
		Message:   integrity,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if !result.Valid {
		return result, fmt.Errorf("backup integrity check failed: %s", integrity)
	}
	return result, nil
}

func (s *Service) pruneOldBackups() error {
	backups, err := s.ListBackups()
	if err != nil {
		return err
	}

	if len(backups) <= s.MaxRetain {
		return nil
	}

	// Remove the oldest ones
	for _, b := range backups[s.MaxRetain:] {
		path := filepath.Join(s.BackupDir, b.Filename)
		if err := os.Remove(path); err != nil {
			return err
		}
	}

	return nil
}
