package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/backup"
	"menettech/dashboard/backend/internal/billing"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

type Service struct {
	Logger   *slog.Logger
	Billing  billing.Service
	Settings settings.Service
	WhatsApp notifications.WhatsAppService
	Discord  notifications.DiscordSender
	Backup   *backup.Service
}

const scheduledBillingLockTTL = 30 * time.Minute

func (s Service) RunLoop(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		interval = time.Minute
	}

	owner := workerOwner()
	lockTTLSeconds, _ := s.Settings.GetInt(ctx, settings.KeyWorkerLockTTLSeconds)
	if lockTTLSeconds <= 0 {
		lockTTLSeconds = int(interval.Seconds())*3 + 60
	}
	acquiredLease, err := s.acquireWorkerLease(ctx, owner, lockTTLSeconds)
	if err != nil {
		return err
	}
	defer func() {
		_ = s.Settings.ReleaseLease(context.Background(), "worker_lock", owner)
	}()

	if acquiredLease {
		if err := s.RunOnce(ctx); err != nil {
			s.Logger.Error("worker run failed", "error", err)
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendAlert(ctx, fmt.Sprintf("⚠️ **Worker Run Error**: %v", err))
			}
		}
	} else {
		s.Logger.Warn("worker lease already held, waiting to acquire", "owner", owner)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			acquired, err := s.acquireWorkerLease(ctx, owner, lockTTLSeconds)
			if err != nil {
				s.Logger.Error("worker lease refresh failed", "error", err)
				continue
			}
			if !acquired {
				if acquiredLease {
					s.Logger.Warn("worker lease lost, waiting to reacquire", "owner", owner)
				}
				acquiredLease = false
				continue
			}
			if !acquiredLease {
				s.Logger.Info("worker lease acquired", "owner", owner)
			}
			acquiredLease = true
			if err := s.RunOnce(ctx); err != nil {
				s.Logger.Error("worker run failed", "error", err)
				if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
					_ = s.Discord.SendAlert(ctx, fmt.Sprintf("⚠️ **Worker Run Error**: %v", err))
				}
			}
		}
	}
}

func (s Service) acquireWorkerLease(ctx context.Context, owner string, lockTTLSeconds int) (bool, error) {
	leaseUntil := time.Now().UTC().Add(time.Duration(lockTTLSeconds) * time.Second).Format(time.RFC3339)
	acquired, err := s.Settings.TryAcquireLease(ctx, "worker_lock", owner, leaseUntil)
	if err != nil {
		return false, fmt.Errorf("acquire worker lease: %w", err)
	}
	return acquired, nil
}

func (s Service) RunOnce(ctx context.Context) error {
	start := time.Now()
	s.Logger.Debug("worker cycle started")
	defer func() {
		s.Logger.Debug("worker cycle completed", "duration_ms", time.Since(start).Milliseconds())
	}()

	now := time.Now()

	_ = s.Settings.Set(ctx, "worker_last_heartbeat", now.UTC().Format(time.RFC3339))
	_ = s.Settings.Set(ctx, "worker_last_cycle_at", now.UTC().Format(time.RFC3339))

	if err := s.runScheduledBackup(ctx, now); err != nil {
		s.Logger.Error("auto backup failed", "error", err)
	}

	// Process trial expiry and auto-generate bills
	if err := s.Billing.ProcessTrialExpiry(ctx, now); err != nil {
		s.Logger.Error("trial expiry processing failed", "error", err)
	}

	if err := s.runScheduledBilling(ctx, now); err != nil {
		_ = s.Settings.Set(ctx, "worker_last_cycle_error", err.Error())
		return err
	}

	reminderDays, err := s.Settings.GetInt(ctx, settings.KeyReminderDays)
	if err != nil {
		_ = s.Settings.Set(ctx, "worker_last_cycle_error", err.Error())
		return err
	}
	limitDays, err := s.Settings.GetInt(ctx, settings.KeyLimitDays)
	if err != nil {
		_ = s.Settings.Set(ctx, "worker_last_cycle_error", err.Error())
		return err
	}
	trialGraceDays, err := s.Settings.GetInt(ctx, settings.KeyTrialGraceDays)
	if err != nil {
		_ = s.Settings.Set(ctx, "worker_last_cycle_error", err.Error())
		return err
	}

	if err := s.Billing.ProcessAutomation(ctx, billing.AutomationOptions{
		Now:            now,
		ReminderDays:   reminderDays,
		LimitDays:      limitDays,
		TrialGraceDays: trialGraceDays,
		SendWhatsApp: func(ctx context.Context, payload billing.AutomationMessage) error {
			return s.WhatsApp.SendTemplate(ctx, notifications.BillMessagePayload{
				BillID:      payload.BillID,
				TriggerKey:  payload.TriggerKey,
				PhoneNumber: payload.PhoneNumber,
				MessageData: payload.TemplateData,
			})
		},
		SendDiscord: func(ctx context.Context, message string) error {
			if s.Discord == nil || !s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				return nil
			}
			return s.Discord.SendAlert(ctx, message)
		},
	}); err != nil {
		_ = s.Settings.Set(ctx, "worker_last_cycle_error", err.Error())
		return err
	}

	_ = s.Settings.Set(ctx, "worker_last_cycle_error", "")
	return nil
}

func (s Service) runScheduledBackup(ctx context.Context, now time.Time) error {
	if s.Backup == nil {
		return nil
	}

	autoEnabled, _ := s.Settings.GetString(ctx, settings.KeyBackupAutoEnabled)
	if strings.TrimSpace(autoEnabled) == "0" {
		return nil
	}

	retention, _ := s.Settings.GetInt(ctx, settings.KeyBackupRetentionCount)
	if retention > 0 {
		s.Backup.MaxRetain = retention
	}

	scheduledTime, _ := s.Settings.GetString(ctx, settings.KeyBackupAutoTime)
	if strings.TrimSpace(scheduledTime) == "" {
		scheduledTime = "02:00"
	}

	if !shouldRunBackupNow(now, scheduledTime) {
		return nil
	}

	// Bug #24: use RFC3339 timestamp key to track last backup time
	lastBackupAt, _ := s.Settings.GetString(ctx, "worker_last_backup_at")
	if lastBackupAt != "" {
		lastTime, err := time.Parse(time.RFC3339, lastBackupAt)
		if err == nil && lastTime.UTC().Format("2006-01-02") == now.UTC().Format("2006-01-02") {
			return nil // Already backed up today
		}
	}

	filename, err := s.Backup.CreateBackup(ctx)
	if err != nil {
		if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
			_ = s.Discord.SendAlert(ctx, fmt.Sprintf("⚠️ **Auto Backup Gagal**: %v", err))
		}
		return err
	}

	s.Logger.Info("auto backup created", "filename", filename)
	// Bug #24: store full RFC3339 timestamp instead of just date string
	// to avoid edge-case double-backup when worker restarts near midnight.
	_ = s.Settings.Set(ctx, "worker_last_backup_at", now.UTC().Format(time.RFC3339))
	_ = s.Settings.Set(ctx, "worker_last_backup_filename", filename)

	if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
		_ = s.Discord.SendAlert(ctx, fmt.Sprintf("💾 **Auto Backup**: Database berhasil dicadangkan ke `%s`", filename))
	}

	return nil
}

func (s Service) runScheduledBilling(ctx context.Context, now time.Time) error {
	autoEnabled, _ := s.Settings.GetString(ctx, settings.KeyBillingAutoEnabled)
	if strings.TrimSpace(autoEnabled) == "0" {
		_ = s.Settings.Set(ctx, "worker_billing_next_run", "")
		return nil
	}

	generateDay, _ := s.Settings.GetInt(ctx, settings.KeyBillingGenerateDay)
	scheduledTime, _ := s.Settings.GetString(ctx, settings.KeyBillingGenerateTime)
	retryAttempts, _ := s.Settings.GetInt(ctx, settings.KeyBillingRetryAttempts)
	retryBackoffSeconds, _ := s.Settings.GetInt(ctx, settings.KeyBillingRetryBackoff)

	if generateDay < 1 {
		generateDay = 1
	}
	if generateDay > 28 {
		generateDay = 28
	}
	if retryAttempts <= 0 {
		retryAttempts = 1
	}
	if retryBackoffSeconds < 0 {
		retryBackoffSeconds = 0
	}
	if strings.TrimSpace(scheduledTime) == "" {
		scheduledTime = "00:05"
	}

	nextRun := nextBillingRun(now, generateDay, scheduledTime)
	_ = s.Settings.Set(ctx, "worker_billing_next_run", nextRun.UTC().Format(time.RFC3339))

	if !shouldRunBillingNow(now, generateDay, scheduledTime) {
		return nil
	}

	period := now.Format("2006-01")
	lastSuccessPeriod, _ := s.Settings.GetString(ctx, "worker_billing_last_success_period")
	if lastSuccessPeriod == period {
		return nil
	}

	inProgressValue, _ := s.Settings.GetString(ctx, "worker_billing_in_progress")
	if billingInProgressActive(inProgressValue, period, now, scheduledBillingLockTTL) {
		s.Logger.Info("scheduled billing: generation already in progress, skipping", "period", period)
		return nil
	}

	// Keep the marker crash-safe but time-bound. A failed process must not block
	// billing generation for the entire month.
	_ = s.Settings.Set(ctx, "worker_billing_in_progress", formatBillingInProgress(period, now))
	defer func() {
		// Success and handled failures both clear the marker. A real crash leaves
		// the marker behind, where billingInProgressActive will expire it by TTL.
		_ = s.Settings.Set(context.Background(), "worker_billing_in_progress", "")
	}()

	var lastErr error
	for attempt := 1; attempt <= retryAttempts; attempt++ {
		_ = s.Settings.Set(ctx, "worker_billing_last_attempt_at", time.Now().UTC().Format(time.RFC3339))
		_ = s.Settings.Set(ctx, "worker_billing_last_period", period)
		_ = s.Settings.Set(ctx, "worker_billing_retry_count", strconv.Itoa(attempt))

		result, err := s.Billing.Generate(ctx, period)
		if err == nil {
			_ = s.Settings.Set(ctx, "worker_billing_last_run_at", time.Now().UTC().Format(time.RFC3339))
			_ = s.Settings.Set(ctx, "worker_billing_last_generated_count", strconv.Itoa(result.Generated))
			_ = s.Settings.Set(ctx, "worker_billing_last_error", "")
			_ = s.Settings.Set(ctx, "worker_billing_last_success_period", period)
			_ = s.Settings.Set(ctx, "worker_billing_retry_count", "0")
			s.Logger.Info("scheduled billing completed", "period", period, "generated", result.Generated, "attempt", attempt)
			return nil
		}

		lastErr = err
		_ = s.Settings.Set(ctx, "worker_billing_last_error", err.Error())
		s.Logger.Error("scheduled billing failed", "period", period, "attempt", attempt, "error", err)

		if attempt >= retryAttempts {
			break
		}
		if err := waitRetryBackoff(ctx, time.Duration(retryBackoffSeconds)*time.Second); err != nil {
			return fmt.Errorf("scheduled billing retry interrupted: %w", err)
		}
	}

	if lastErr != nil {
		return fmt.Errorf("worker generate scheduled bills for %s: %w", period, lastErr)
	}
	return nil
}

// shouldRunBackupNow returns true when the current time matches the scheduled backup time.
// Bug #8: now uses parseScheduleTime which validates hour (0-23) and minute (0-59),
// fixing the inconsistency where a failed minute parse would silently use 0 while
// a failed hour parse would return the default fallback.
func shouldRunBackupNow(now time.Time, scheduledTime string) bool {
	hour, minute := parseScheduleTime(scheduledTime, 2, 0) // default 02:00
	return now.Hour() == hour && now.Minute() >= minute
}

func shouldRunBillingNow(now time.Time, day int, scheduledTime string) bool {
	hour, minute := parseScheduleTime(scheduledTime, 0, 5)
	if now.Day() < day {
		return false
	}
	if now.Day() > day {
		return true
	}
	if now.Hour() > hour {
		return true
	}
	if now.Hour() == hour && now.Minute() >= minute {
		return true
	}
	return false
}

func nextBillingRun(now time.Time, day int, scheduledTime string) time.Time {
	hour, minute := parseScheduleTime(scheduledTime, 0, 5)
	location := now.Location()
	currentCandidate := time.Date(now.Year(), now.Month(), clampDay(day, now.Year(), now.Month()), hour, minute, 0, 0, location)
	if now.Before(currentCandidate) {
		return currentCandidate
	}

	nextMonth := now.AddDate(0, 1, 0)
	return time.Date(nextMonth.Year(), nextMonth.Month(), clampDay(day, nextMonth.Year(), nextMonth.Month()), hour, minute, 0, 0, location)
}

func parseScheduleTime(value string, fallbackHour, fallbackMinute int) (int, int) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 2 {
		return fallbackHour, fallbackMinute
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		hour = fallbackHour
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil || minute < 0 || minute > 59 {
		minute = fallbackMinute
	}
	return hour, minute
}

func clampDay(day, year int, month time.Month) int {
	if day < 1 {
		day = 1
	}
	last := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > last {
		return last
	}
	return day
}

func waitRetryBackoff(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		if errors.Is(ctx.Err(), context.Canceled) {
			return context.Canceled
		}
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func formatBillingInProgress(period string, now time.Time) string {
	return period + "|" + now.UTC().Format(time.RFC3339)
}

func billingInProgressActive(value, period string, now time.Time, ttl time.Duration) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	parts := strings.SplitN(value, "|", 2)
	if strings.TrimSpace(parts[0]) != period {
		return false
	}
	if len(parts) != 2 {
		// Legacy markers only stored the period and could deadlock generation
		// forever after a failed attempt. Treat them as stale.
		return false
	}
	startedAt, err := time.Parse(time.RFC3339, strings.TrimSpace(parts[1]))
	if err != nil {
		return false
	}
	if ttl <= 0 {
		ttl = scheduledBillingLockTTL
	}
	return now.UTC().Before(startedAt.UTC().Add(ttl))
}

func workerOwner() string {
	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		host = "unknown-host"
	}
	return fmt.Sprintf("%s:%d", host, os.Getpid())
}
