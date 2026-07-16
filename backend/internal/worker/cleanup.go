package worker

import (
	"context"
	"time"
)

// runAutoCleanup deletes logs older than 90 days.
func (s Service) runAutoCleanup(ctx context.Context, now time.Time) error {
	// Only run once a day, for example at 02:00 AM.
	// Since worker cycle is roughly every minute, we check if it's 2 AM and hasn't run today.
	if now.Hour() != 2 {
		return nil
	}

	lastCleanupAt, _ := s.Settings.GetString(ctx, "worker_last_cleanup_at")
	if lastCleanupAt != "" {
		lastTime, err := time.Parse(time.RFC3339, lastCleanupAt)
		if err == nil && lastTime.UTC().Format("2006-01-02") == now.UTC().Format("2006-01-02") {
			return nil // Already cleaned up today
		}
	}

	s.Logger.Info("running auto cleanup for logs older than 90 days")

	// Cutoff date is 90 days ago
	cutoff := now.AddDate(0, 0, -90).Format("2006-01-02 15:04:05")

	if s.DB != nil {
		// Cleanup whatsapp_queue
		if _, err := s.DB.ExecContext(ctx, `DELETE FROM whatsapp_queue WHERE created_at < ?`, cutoff); err != nil {
			s.Logger.Error("failed to cleanup whatsapp_queue", "error", err)
		}

		// Cleanup notification_logs
		if _, err := s.DB.ExecContext(ctx, `DELETE FROM notification_logs WHERE created_at < ?`, cutoff); err != nil {
			s.Logger.Error("failed to cleanup notification_logs", "error", err)
		}

		// Cleanup audit_logs
		if _, err := s.DB.ExecContext(ctx, `DELETE FROM audit_logs WHERE created_at < ?`, cutoff); err != nil {
			s.Logger.Error("failed to cleanup audit_logs", "error", err)
		}
	}

	_ = s.Settings.Set(ctx, "worker_last_cleanup_at", now.UTC().Format(time.RFC3339))
	return nil
}
