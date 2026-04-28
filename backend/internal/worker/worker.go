package worker

import (
	"context"
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

func (s Service) RunLoop(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		interval = time.Minute
	}

	owner := workerOwner()
	lockTTLSeconds, _ := s.Settings.GetInt(ctx, settings.KeyWorkerLockTTLSeconds)
	if lockTTLSeconds <= 0 {
		lockTTLSeconds = int(interval.Seconds())*3 + 60
	}
	leaseUntil := time.Now().UTC().Add(time.Duration(lockTTLSeconds) * time.Second).Format(time.RFC3339)
	acquired, err := s.Settings.TryAcquireLease(ctx, "worker_lock", owner, leaseUntil)
	if err != nil {
		return fmt.Errorf("acquire worker lease: %w", err)
	}
	if !acquired {
		s.Logger.Warn("worker lease already held, skipping startup", "owner", owner)
		return nil
	}
	defer func() {
		_ = s.Settings.ReleaseLease(context.Background(), "worker_lock", owner)
	}()

	if err := s.RunOnce(ctx); err != nil {
		s.Logger.Error("worker run failed", "error", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			leaseUntil := time.Now().UTC().Add(time.Duration(lockTTLSeconds) * time.Second).Format(time.RFC3339)
			acquired, err := s.Settings.TryAcquireLease(ctx, "worker_lock", owner, leaseUntil)
			if err != nil {
				s.Logger.Error("worker lease refresh failed", "error", err)
				continue
			}
			if !acquired {
				s.Logger.Warn("worker lease lost, stopping loop", "owner", owner)
				return nil
			}
			if err := s.RunOnce(ctx); err != nil {
				s.Logger.Error("worker run failed", "error", err)
			}
		}
	}
}

func (s Service) RunOnce(ctx context.Context) error {
	now := time.Now()

	_ = s.Settings.Set(ctx, "worker_last_heartbeat", now.UTC().Format(time.RFC3339))

	if err := s.runScheduledBackup(ctx, now); err != nil {
		s.Logger.Error("auto backup failed", "error", err)
	}

	period := now.Format("2006-01")

	if _, err := s.Billing.Generate(ctx, period); err != nil {
		return fmt.Errorf("worker generate current period bills: %w", err)
	}

	reminderDays, err := s.Settings.GetInt(ctx, settings.KeyReminderDays)
	if err != nil {
		return err
	}
	limitDays, err := s.Settings.GetInt(ctx, settings.KeyLimitDays)
	if err != nil {
		return err
	}

	return s.Billing.ProcessAutomation(ctx, billing.AutomationOptions{
		Now:          now,
		ReminderDays: reminderDays,
		LimitDays:    limitDays,
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
	})
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

	today := now.UTC().Format("2006-01-02")
	lastBackup, _ := s.Settings.GetString(ctx, "worker_last_backup_date")
	if lastBackup == today {
		return nil
	}

	filename, err := s.Backup.CreateBackup(ctx)
	if err != nil {
		return err
	}

	s.Logger.Info("auto backup created", "filename", filename)
	_ = s.Settings.Set(ctx, "worker_last_backup_date", today)
	_ = s.Settings.Set(ctx, "worker_last_backup_filename", filename)

	if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
		_ = s.Discord.SendAlert(ctx, fmt.Sprintf("💾 **Auto Backup**: Database berhasil dicadangkan ke `%s`", filename))
	}

	return nil
}

func shouldRunBackupNow(now time.Time, scheduledTime string) bool {
	parts := strings.Split(strings.TrimSpace(scheduledTime), ":")
	if len(parts) != 2 {
		return now.Hour() == 2
	}

	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return now.Hour() == 2
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil {
		minute = 0
	}

	return now.Hour() == hour && now.Minute() >= minute
}

func workerOwner() string {
	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		host = "unknown-host"
	}
	return fmt.Sprintf("%s:%d", host, os.Getpid())
}
