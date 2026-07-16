package worker

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s Service) runArchiver(ctx context.Context, now time.Time) error {
	// Only run once a day at 01:00 AM
	if now.Hour() != 1 || now.Minute() != 0 {
		return nil
	}

	period := now.Format("2006-01-02")
	lastSuccess, _ := s.Settings.GetString(ctx, "worker_archiver_last_success")
	if lastSuccess == period {
		return nil
	}

	s.Logger.Info("starting storage archiver")

	uploadsDir := filepath.Join(s.StoragePath, "uploads", "payment-proofs")
	if _, err := os.Stat(uploadsDir); os.IsNotExist(err) {
		s.Logger.Info("archiver: uploads directory does not exist, skipping")
		_ = s.Settings.Set(ctx, "worker_archiver_last_success", period)
		return nil
	}

	thresholdDate := now.AddDate(0, 0, -60) // Older than 60 days
	files, err := os.ReadDir(uploadsDir)
	if err != nil {
		return fmt.Errorf("failed to read uploads directory: %w", err)
	}

	type ArchiveGroup struct {
		Month string // YYYY-MM
		Files []string
	}
	groups := make(map[string]*ArchiveGroup)

	for _, f := range files {
		if f.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
			continue
		}

		info, err := f.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(thresholdDate) {
			monthStr := info.ModTime().Format("2006-01")
			if _, exists := groups[monthStr]; !exists {
				groups[monthStr] = &ArchiveGroup{Month: monthStr, Files: []string{}}
			}
			groups[monthStr].Files = append(groups[monthStr].Files, f.Name())
		}
	}

	if len(groups) == 0 {
		_ = s.Settings.Set(ctx, "worker_archiver_last_success", period)
		return nil
	}

	for monthStr, group := range groups {
		if err := s.archiveGroup(uploadsDir, monthStr, group.Files); err != nil {
			s.Logger.Error("archiver: failed to archive group", "month", monthStr, "error", err)
			return err
		}
	}

	_ = s.Settings.Set(ctx, "worker_archiver_last_success", period)
	s.Logger.Info("storage archiver completed")
	return nil
}

func (s Service) archiveGroup(uploadsDir, monthStr string, fileNames []string) error {
	zipName := fmt.Sprintf("archive-%s.zip", monthStr)
	zipPath := filepath.Join(uploadsDir, zipName)

	s.Logger.Info("archiver: archiving files", "month", monthStr, "count", len(fileNames), "zip", zipName)

	var zipWriter *zip.Writer

	// Check if zip already exists. If yes, append to it by copying to a temp zip, then appending.
	// But it's simpler to just create a new zip for this batch and maybe suffix it if needed,
	// or create a temp file, write old zip + new files, and replace.
	// We'll just assume appending requires reading old zip. For simplicity, we just create
	// "archive-YYYY-MM-{timestamp}.zip" if we want to avoid complex appends, or just group them
	// by year-month-day if we don't want conflicts.
	// Actually, wait, older than 60 days means this month is completely in the past.
	// We might have multiple days archiving the same month if there are files added late.
	// Let's use a unique name based on the archive timestamp.
	zipName = fmt.Sprintf("archive-%s-%d.zip", monthStr, time.Now().Unix())
	zipPath = filepath.Join(uploadsDir, zipName)

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	zipWriter = zip.NewWriter(zipFile)

	for _, name := range fileNames {
		filePath := filepath.Join(uploadsDir, name)
		if err := addFileToZip(zipWriter, filePath, name); err != nil {
			s.Logger.Error("archiver: failed to add file to zip", "file", name, "error", err)
			continue
		}
	}

	if err := zipWriter.Close(); err != nil {
		return err
	}

	// Delete originals only if zip created successfully
	deletedCount := 0
	for _, name := range fileNames {
		filePath := filepath.Join(uploadsDir, name)
		if err := os.Remove(filePath); err == nil {
			deletedCount++
		}
	}

	s.Logger.Info("archiver: deleted original files", "count", deletedCount)
	return nil
}

func addFileToZip(zipWriter *zip.Writer, filePath, name string) error {
	fileToZip, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer fileToZip.Close()

	info, err := fileToZip.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = name
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, fileToZip)
	return err
}
