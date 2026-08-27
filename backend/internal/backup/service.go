package backup

import (
	"archive/zip"
	"bytes"
	"compress/flate"
	"context"
	"database/sql"
	"fmt"
	"io"
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
	DB         *sql.DB
	BackupDir  string
	LiveDBPath string // absolute or relative path to the live SQLite file
	MaxRetain  int
}

func NewService(db *sql.DB, backupDir, liveDBPath string) *Service {
	return &Service{
		DB:         db,
		BackupDir:  backupDir,
		LiveDBPath: liveDBPath,
		MaxRetain:  3, // retain last 3 backups by default
	}
}

func (s *Service) CreateBackup(ctx context.Context) (string, error) {
	if err := os.MkdirAll(s.BackupDir, 0755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}

	timestamp := time.Now().UTC().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("dashboard_%s.db", timestamp)
	backupPath := filepath.Join(s.BackupDir, filename)

	// Validate that backupPath is within BackupDir (prevent directory traversal)
	absBackupDir, err := filepath.Abs(s.BackupDir)
	if err != nil {
		return "", fmt.Errorf("resolve backup dir: %w", err)
	}
	absBackupPath, err := filepath.Abs(backupPath)
	if err != nil {
		return "", fmt.Errorf("resolve backup path: %w", err)
	}
	if !strings.HasPrefix(absBackupPath, absBackupDir+string(filepath.Separator)) && absBackupPath != absBackupDir {
		return "", fmt.Errorf("backup path outside backup directory")
	}

	// Use SQLite VACUUM INTO for a safe online backup.
	// VACUUM INTO does not support parameterized queries, so we escape single quotes manually.
	escapedPath := strings.ReplaceAll(absBackupPath, "'", "''")
	query := fmt.Sprintf("VACUUM INTO '%s'", escapedPath)
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
		ext := filepath.Ext(entry.Name())
		if entry.IsDir() || (ext != ".db" && ext != ".enc") || strings.HasPrefix(entry.Name(), "backup_mikrotik_") {
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
	ext := filepath.Ext(filename)
	if ext != ".db" && ext != ".enc" && ext != ".zip" {
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
	tempDbFile, err := os.CreateTemp("", "verify-db-*.db")
	if err != nil {
		return VerificationResult{}, fmt.Errorf("create temp file: %w", err)
	}
	tempPath := tempDbFile.Name()
	tempDbFile.Close()
	defer os.Remove(tempPath)

	password := s.getBackupPassword(ctx)
	if err := s.ExtractBackupDatabase(filename, tempPath, password); err != nil {
		return VerificationResult{}, err
	}

	db, err := sql.Open("sqlite", tempPath)
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

// RotateZipBackups renames newZipPath to a timestamped format and keeps only the latest maxRetain zip backups.
// Returns the final path of the new backup.
func (s *Service) RotateZipBackups(newZipPath string, maxRetain int) (string, error) {
	timestamp := time.Now().UTC().Format("2006-01-02_15-04-05")
	finalName := fmt.Sprintf("backup_%s.zip", timestamp)
	finalPath := filepath.Join(s.BackupDir, finalName)

	if err := os.Rename(newZipPath, finalPath); err != nil {
		return "", fmt.Errorf("failed to move new zip to %s: %w", finalPath, err)
	}

	entries, err := os.ReadDir(s.BackupDir)
	if err != nil {
		return finalPath, nil
	}

	type fileInfo struct {
		name    string
		modTime time.Time
	}
	var zips []fileInfo
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".zip" && strings.HasPrefix(entry.Name(), "backup_") {
			if info, err := entry.Info(); err == nil {
				zips = append(zips, fileInfo{name: entry.Name(), modTime: info.ModTime()})
			}
		}
	}

	sort.Slice(zips, func(i, j int) bool {
		return zips[i].modTime.After(zips[j].modTime)
	})

	if len(zips) > maxRetain {
		for _, b := range zips[maxRetain:] {
			_ = os.Remove(filepath.Join(s.BackupDir, b.name))
		}
	}

	return finalPath, nil
}

func (s *Service) getBackupPassword(ctx context.Context) string {
	var value string
	row := s.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'backup_encryption_password'")
	_ = row.Scan(&value)

	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}

	if envVal := strings.TrimSpace(os.Getenv("DASHBOARD_INTERNAL_API_KEY")); envVal != "" {
		return envVal
	}

	return "menettech_backup_pass"
}

func (s *Service) ExtractBackupDatabase(filename, destPath string, password string) error {
	path, err := s.GetBackupPath(filename)
	if err != nil {
		return err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read backup file: %w", err)
	}

	var dbBytes []byte

	if len(data) >= 16 && string(data[:16]) == "SQLite format 3\x00" {
		dbBytes = data
	} else if len(data) >= 4 && string(data[:4]) == "PK\x03\x04" {
		dbBytes, err = s.extractFromZip(data, password)
		if err != nil {
			return err
		}
	} else if len(data) >= 8 && string(data[:8]) == SaltedMagic {
		decrypted, err := DecryptAES256CBC(data, password)
		if err != nil {
			return fmt.Errorf("gagal mendekripsi backup. Pastikan password enkripsi backup di Pengaturan sudah benar: %w", err)
		}
		if len(decrypted) >= 4 && string(decrypted[:4]) == "PK\x03\x04" {
			dbBytes, err = s.extractFromZip(decrypted, password)
			if err != nil {
				return err
			}
		} else if len(decrypted) >= 16 && string(decrypted[:16]) == "SQLite format 3\x00" {
			dbBytes = decrypted
		} else {
			return fmt.Errorf("format data hasil dekripsi tidak dikenal")
		}
	} else {
		return fmt.Errorf("format file backup tidak dikenal")
	}

	if err := os.WriteFile(destPath, dbBytes, 0644); err != nil {
		return fmt.Errorf("write extracted database: %w", err)
	}

	return nil
}

func (s *Service) extractFromZip(zipBytes []byte, password string) ([]byte, error) {
	reader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, fmt.Errorf("open zip reader: %w", err)
	}

	// 1. First look for plain dashboard.db
	for _, f := range reader.File {
		if f.Name == "dashboard.db" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("open zip entry dashboard.db: %w", err)
			}
			defer rc.Close()
			return io.ReadAll(rc)
		}
	}

	// 2. Then look for encrypted dashboard.db.enc
	for _, f := range reader.File {
		if f.Name == "dashboard.db.enc" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("open zip entry dashboard.db.enc: %w", err)
			}
			defer rc.Close()
			encBytes, err := io.ReadAll(rc)
			if err != nil {
				return nil, fmt.Errorf("read zip entry dashboard.db.enc: %w", err)
			}
			decrypted, err := DecryptAES256CBC(encBytes, password)
			if err != nil {
				return nil, fmt.Errorf("gagal mendekripsi dashboard.db.enc. Pastikan password enkripsi backup di Pengaturan sudah benar: %w", err)
			}
			return decrypted, nil
		}
	}

	return nil, fmt.Errorf("dashboard.db atau dashboard.db.enc tidak ditemukan di dalam archive zip")
}



func (s *Service) HasLocalBackupToday(ctx context.Context) (bool, string, error) {
	files, err := os.ReadDir(s.BackupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return false, "", nil
		}
		return false, "", err
	}

	todayDate := time.Now().UTC().Format("2006-01-02")
	prefix := "dashboard_" + todayDate

	for _, file := range files {
		if !file.IsDir() && strings.HasPrefix(file.Name(), prefix) && strings.HasSuffix(file.Name(), ".db") {
			return true, file.Name(), nil
		}
	}

	return false, "", nil
}

func (s *Service) isBackupEncryptionEnabled(ctx context.Context) bool {
	var value string
	row := s.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'backup_encryption_enabled'")
	_ = row.Scan(&value)
	return strings.TrimSpace(value) != "0"
}

func (s *Service) BuildDiscordBackupZip(ctx context.Context, localDbFilename string, mikrotikBackups map[string][]byte, password string) ([]byte, error) {
	if password == "" {
		password = s.getBackupPassword(ctx)
	}

	// Read database file
	dbPath := filepath.Join(s.BackupDir, localDbFilename)
	dbBytes, err := os.ReadFile(dbPath)
	if err != nil {
		return nil, fmt.Errorf("read local db: %w", err)
	}

	encrypt := s.isBackupEncryptionEnabled(ctx)

	var dbFileBytes []byte
	var dbEntryName string
	if encrypt {
		dbEntryName = "dashboard.db.enc"
		dbFileBytes, err = EncryptAES256CBC(dbBytes, password)
		if err != nil {
			return nil, fmt.Errorf("encrypt db bytes: %w", err)
		}
	} else {
		dbEntryName = "dashboard.db"
		dbFileBytes = dbBytes
	}

	var zipBuf bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuf)

	zipWriter.RegisterCompressor(zip.Deflate, func(out io.Writer) (io.WriteCloser, error) {
		return flate.NewWriter(out, flate.BestCompression)
	})

	// Add database entry to ZIP
	w, err := zipWriter.Create(dbEntryName)
	if err != nil {
		return nil, fmt.Errorf("create zip entry %s: %w", dbEntryName, err)
	}
	if _, err := w.Write(dbFileBytes); err != nil {
		return nil, fmt.Errorf("write zip entry %s: %w", dbEntryName, err)
	}

	// Add MikroTik configurations to ZIP
	for name, data := range mikrotikBackups {
		if len(data) > 0 {
			var mtFileBytes []byte
			var mtEntryName string
			if encrypt {
				mtEntryName = fmt.Sprintf("mikrotik_%s.json.enc", name)
				mtFileBytes, err = EncryptAES256CBC(data, password)
				if err != nil {
					return nil, fmt.Errorf("encrypt mikrotik bytes for %s: %w", name, err)
				}
			} else {
				mtEntryName = fmt.Sprintf("mikrotik_%s.json", name)
				mtFileBytes = data
			}

			w, err := zipWriter.Create(mtEntryName)
			if err != nil {
				return nil, fmt.Errorf("create zip entry %s: %w", mtEntryName, err)
			}
			if _, err := w.Write(mtFileBytes); err != nil {
				return nil, fmt.Errorf("write zip entry %s: %w", mtEntryName, err)
			}
		}
	}

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("close zip writer: %w", err)
	}

	return zipBuf.Bytes(), nil
}
