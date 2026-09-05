package worker

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/backup"
	"menettech/dashboard/backend/internal/billing"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

type Service struct {
	Logger      *slog.Logger
	Billing     billing.Service
	Settings    settings.Service
	WhatsApp    notifications.WhatsAppService
	Discord     notifications.DiscordSender
	Backup      *backup.Service
	Customers   customers.Service
	Email       *notifications.EmailService
	StoragePath string
	DB          *sql.DB
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

	var queueCtx context.Context
	var cancelQueue context.CancelFunc

	startQueues := func() {
		if cancelQueue == nil {
			queueCtx, cancelQueue = context.WithCancel(ctx)
			go s.startQueueProcessor(queueCtx)
			go s.startEmailQueueProcessor(queueCtx)
		}
	}
	stopQueues := func() {
		if cancelQueue != nil {
			cancelQueue()
			cancelQueue = nil
		}
	}

	acquiredLease, err := s.acquireWorkerLease(ctx, owner, lockTTLSeconds)
	if err != nil {
		return err
	}
	defer func() {
		stopQueues()
		_ = s.Settings.ReleaseLease(context.Background(), "worker_lock", owner)
	}()

	if acquiredLease {
		startQueues()

		if err := s.RunOnce(ctx); err != nil {
			s.Logger.Error("worker run failed", "error", err)
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "⚠️ Worker Loop Error",
					Description: "Terjadi kesalahan saat mengeksekusi cycle daemon worker.",
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Pesan Kesalahan", Value: err.Error(), Inline: false},
					},
				})
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
				errStr := err.Error()
				if strings.Contains(errStr, "malformed") || strings.Contains(errStr, "I/O error") || strings.Contains(errStr, "database is closed") || strings.Contains(errStr, "no such table") {
					s.Logger.Error("Fatal database error detected. Exiting worker for self-healing/restart...")
					os.Exit(1)
				}
				continue
			}
			if !acquired {
				if acquiredLease {
					s.Logger.Warn("worker lease lost, waiting to reacquire", "owner", owner)
					stopQueues()
				}
				acquiredLease = false
				continue
			}
			if !acquiredLease {
				s.Logger.Info("worker lease acquired", "owner", owner)
				startQueues()
			}
			acquiredLease = true
			if err := s.RunOnce(ctx); err != nil {
				s.Logger.Error("worker run failed", "error", err)
				errStr := err.Error()
				if strings.Contains(errStr, "malformed") || strings.Contains(errStr, "I/O error") || strings.Contains(errStr, "database is closed") || strings.Contains(errStr, "no such table") {
					s.Logger.Error("Fatal database error during worker run. Exiting worker for self-healing/restart...")
					os.Exit(1)
				}
				if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
					_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
						Title:       "⚠️ Worker Loop Error",
						Description: "Terjadi kesalahan saat mengeksekusi cycle daemon worker.",
						Color:       15158332, // Red (#e74c3c)
						Fields: []notifications.EmbedField{
							{Name: "Pesan Kesalahan", Value: err.Error(), Inline: false},
						},
					})
				}
			}
		}
	}
}

func (s Service) startEmailQueueProcessor(ctx context.Context) {
	if s.Email == nil {
		s.Logger.Warn("email queue processor: service is nil, skipping")
		return
	}
	s.Logger.Info("email queue processor started")
	// Adaptive idle sleep: backs off from 500ms up to 5s when queue is empty,
	// resets immediately when a message is processed.
	idleSleep := 500 * time.Millisecond
	const maxIdleSleep = 5 * time.Second
	for {
		select {
		case <-ctx.Done():
			s.Logger.Info("email queue processor stopped")
			return
		default:
			processed, err := s.Email.ProcessQueue(ctx)
			if err != nil {
				s.Logger.Error("email queue processing encountered error", "error", err)
				idleSleep = 500 * time.Millisecond
				time.Sleep(2 * time.Second)
				continue
			}

			if processed {
				idleSleep = 500 * time.Millisecond
				time.Sleep(1 * time.Second) // 1s throttle between mails
			} else {
				time.Sleep(idleSleep)
				if idleSleep < maxIdleSleep {
					idleSleep = min(idleSleep*2, maxIdleSleep)
				}
			}
		}
	}
}

func (s Service) getQueueThrottleDuration(ctx context.Context) time.Duration {
	throttleSecs, _ := s.Settings.GetInt(ctx, "wa_queue_throttle_seconds")
	if throttleSecs <= 0 {
		throttleSecs = 2 // default 2 seconds (reduced from 5s)
	}
	return time.Duration(throttleSecs) * time.Second
}

func (s Service) startQueueProcessor(ctx context.Context) {
	if s.WhatsApp.Logs.DB == nil {
		s.Logger.Warn("whatsapp queue processor: database connection is nil, skipping")
		return
	}
	s.Logger.Info("whatsapp queue processor started")
	// Adaptive idle sleep: backs off from 500ms up to 5s when queue is empty,
	// resets immediately when a message is processed.
	idleSleep := 500 * time.Millisecond
	const maxIdleSleep = 5 * time.Second
	for {
		select {
		case <-ctx.Done():
			s.Logger.Info("whatsapp queue processor stopped")
			return
		default:
			processed, isManual, err := s.WhatsApp.ProcessQueue(ctx)
			if err != nil {
				// If processed is true, it means it was a send failure (gateway error).
				// We act as a circuit breaker and pause for 60 seconds.
				if processed {
					s.Logger.Error("whatsapp gateway error detected, pausing queue for 15 seconds (circuit breaker)", "error", err)
					idleSleep = 500 * time.Millisecond
					time.Sleep(15 * time.Second)
				} else {
					s.Logger.Error("queue processing encountered error", "error", err)
					idleSleep = 500 * time.Millisecond
					time.Sleep(2 * time.Second)
				}
				continue
			}

			if processed {
				idleSleep = 500 * time.Millisecond
				if isManual {
					s.Logger.Info("manual WhatsApp notification processed, skipping queue throttle delay")
					time.Sleep(1 * time.Second) // 1s safety interval for manual trigger
				} else {
					time.Sleep(s.getQueueThrottleDuration(ctx))
				}
			} else {
				// No pending messages, back off adaptively to reduce DB query pressure.
				time.Sleep(idleSleep)
				if idleSleep < maxIdleSleep {
					idleSleep = min(idleSleep*2, maxIdleSleep)
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

	if err := s.runScheduledMikrotikSync(ctx, now); err != nil {
		s.Logger.Error("scheduled mikrotik sync failed", "error", err)
	}

	if err := s.runArchiver(ctx, now); err != nil {
		s.Logger.Error("storage archiver failed", "error", err)
	}

	if err := s.runAutoCleanup(ctx, now); err != nil {
		s.Logger.Error("auto cleanup failed", "error", err)
	}

	// Process trial expiry and auto-generate bills
	if err := s.Billing.ProcessTrialExpiry(ctx, now); err != nil {
		s.Logger.Error("trial expiry processing failed", "error", err)
	}

	// Process delayed paid/extension actions (cancelable within 10 minutes)
	if err := s.Billing.ProcessDelayedActions(ctx); err != nil {
		s.Logger.Error("processing delayed actions failed", "error", err)
	}

	// Integration status pooling
	if err := s.runIntegrationPooling(ctx, now); err != nil {
		s.Logger.Error("integration status pooling failed", "error", err)
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
			var waErr error
			if payload.CustomBody != "" {
				waErr = s.WhatsApp.QueueGroupedMessage(ctx, "default", payload.PhoneNumber, payload.CustomBody, payload.GroupBillIDs, payload.TriggerKey)
			} else {
				waErr = s.WhatsApp.SendTemplate(ctx, notifications.BillMessagePayload{
					BillID:      payload.BillID,
					TriggerKey:  payload.TriggerKey,
					PhoneNumber: payload.PhoneNumber,
					MessageData: payload.TemplateData,
				})
				s.Billing.QueueEmailForTrigger(ctx, payload.BillID, payload.TriggerKey, payload.TemplateData)
			}
			return waErr
		},
		SendDiscord: func(ctx context.Context, message string) error {
			if s.Discord == nil || !s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				return nil
			}
			if strings.Contains(message, "Layanan Ditangguhkan") {
				parts := strings.Split(message, "Pelanggan **")
				custName := ""
				if len(parts) > 1 {
					custName = strings.Split(parts[1], "**")[0]
				}
				return s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "🚫 Layanan Ditangguhkan (Suspended)",
					Description: fmt.Sprintf("Pelanggan **%s** telah ditangguhkan karena tunggakan tagihan melebihi batas toleransi (internet dinonaktifkan tetapi ONT tetap terhubung).", custName),
					Color:       9807270, // Grey/purple
					Fields: []notifications.EmbedField{
						{Name: "Nama Pelanggan", Value: custName, Inline: true},
						{Name: "Status Baru", Value: "Suspended (Ditangguhkan)", Inline: true},
					},
				})
			} else if strings.Contains(message, "Layanan Dinonaktifkan") {
				parts := strings.Split(message, "Pelanggan **")
				custName := ""
				if len(parts) > 1 {
					custName = strings.Split(parts[1], "**")[0]
				}
				return s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "🚫 Layanan Dinonaktifkan (Inactive)",
					Description: fmt.Sprintf("Pelanggan **%s** telah dinonaktifkan sepenuhnya dari jaringan (PPPoE Secret Dinonaktifkan) karena tunggakan tagihan melebihi batas.", custName),
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Nama Pelanggan", Value: custName, Inline: true},
						{Name: "Status Baru", Value: "Inactive (Nonaktif)", Inline: true},
					},
				})
			} else if strings.Contains(message, "Isolir (Limit)") {
				parts := strings.Split(message, "Pelanggan **")
				custName := ""
				if len(parts) > 1 {
					custName = strings.Split(parts[1], "**")[0]
				}
				return s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "🚫 Pembatasan Layanan (Limit)",
					Description: fmt.Sprintf("Pelanggan **%s** otomatis dimasukkan ke profil isolir/limit bandwidth karena keterlambatan pembayaran.", custName),
					Color:       15105570, // Orange (#e67e22)
					Fields: []notifications.EmbedField{
						{Name: "Nama Pelanggan", Value: custName, Inline: true},
						{Name: "Status Baru", Value: "Limit (Terisolir)", Inline: true},
					},
				})
			} else if strings.Contains(message, "Combined") {
				return s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "⏳ Notifikasi Tagihan Terkirim",
					Description: message,
					Color:       3447003, // Blue (#3498db)
				})
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

	// 1. Check if a local database backup was already created today
	hasLocal, filename, err := s.Backup.HasLocalBackupToday(ctx)
	if err != nil {
		s.Logger.Error("failed to check for today's local backup", "error", err)
	}

	var backupTypeMsg string
	if hasLocal {
		s.Logger.Info("local database backup already exists today, skipping db dump", "filename", filename)
		backupTypeMsg = "Konfigurasi MikroTik (Menggunakan database lokal hari ini)"
	} else {
		s.Logger.Info("no local database backup today, creating new local db backup")
		filename, err = s.Backup.CreateBackup(ctx)
		if err != nil {
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "⚠️ Auto Backup Gagal",
					Description: "Sistem gagal melakukan pencadangan otomatis.",
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Error", Value: err.Error(), Inline: false},
					},
				})
			}
			return err
		}
		backupTypeMsg = "Database Dashboard dan Konfigurasi MikroTik"
	}

	// 2. Fetch active MikroTik configurations
	mikrotikBackups := make(map[string][]byte)
	if s.DB != nil {
		routerSvc := mikrotik.NewRouterService(s.DB)
		if routers, err := routerSvc.ListActive(ctx); err == nil && len(routers) > 0 {
			for _, r := range routers {
				client := mikrotik.NewClient(r.Host, r.Username, r.Password)
				if data, err := client.ExportBackup(ctx); err == nil && len(data) > 0 {
					mikrotikBackups[r.Name] = data
				}
			}
		} else {
			// Legacy fallback
			mikrotikHost, _ := s.Settings.GetString(ctx, settings.KeyMikrotikHost)
			mikrotikUser, _ := s.Settings.GetString(ctx, settings.KeyMikrotikUser)
			mikrotikPass, _ := s.Settings.GetString(ctx, settings.KeyMikrotikPass)
			if strings.TrimSpace(mikrotikHost) != "" && strings.TrimSpace(mikrotikUser) != "" {
				client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
				if data, err := client.ExportBackup(ctx); err == nil && len(data) > 0 {
					mikrotikBackups["default"] = data
				}
			}
		}
	}

	// 3. Build encrypted zip payload for Discord
	zipBytes, err := s.Backup.BuildDiscordBackupZip(ctx, filename, mikrotikBackups, "")
	if err != nil {
		s.Logger.Error("failed to build Discord backup zip", "error", err)
		return err
	}

	s.Logger.Info("auto backup created", "filename", filename)

	_ = s.Settings.Set(ctx, "worker_last_backup_at", now.UTC().Format(time.RFC3339))
	_ = s.Settings.Set(ctx, "worker_last_backup_filename", filename)

	// 4. Send encrypted backup ZIP file to Discord
	if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
		timestamp := time.Now().Format("2006-01-02_15-04-05")
		zipFilename := fmt.Sprintf("backup_auto_%s.zip", timestamp)
		msg := fmt.Sprintf("✅ **Auto Backup Sukses!**\n%s berhasil dicadangkan (Terenkripsi di dalam ZIP).", backupTypeMsg)
		_ = s.Discord.SendFile(ctx, msg, zipFilename, zipBytes)
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
	if generateDay > 31 {
		generateDay = 31
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

func (s Service) runIntegrationPooling(ctx context.Context, now time.Time) error {
	// Read customers
	cList, err := s.Customers.List(ctx)
	if err != nil {
		return fmt.Errorf("list customers: %w", err)
	}

	if len(cList) == 0 {
		return nil
	}

	// 1. Fetch MikroTik Active Connections from all active routers, with legacy fallback
	activePPPMap := make(map[string]mikrotik.PPPActive)
	if s.DB != nil {
		routerSvc := mikrotik.NewRouterService(s.DB)
		if routers, err := routerSvc.ListActive(ctx); err == nil && len(routers) > 0 {
			for _, r := range routers {
				client := mikrotik.NewClient(r.Host, r.Username, r.Password)
				if err := client.Connect(ctx); err == nil {
					// Check offline -> online transition
					if !r.IsOnline {
						s.Logger.Info("Router transitioned from offline to online, running reconciliation", "router", r.Name, "host", r.Host)
						if err := routerSvc.ReconcileSecrets(ctx, r); err != nil {
							s.Logger.Error("failed to reconcile secrets on recovered router", "router", r.Name, "error", err)
						} else {
							s.Logger.Info("reconciliation of secrets completed successfully", "router", r.Name)
							if r.Role == "main" {
								s.Logger.Info("recovered router is main, syncing main to slaves", "router", r.Name)
								if _, syncErr := routerSvc.SyncMainToSlaves(ctx); syncErr != nil {
									s.Logger.Error("failed to sync main to slaves after recovery", "error", syncErr)
								} else {
									s.Logger.Info("sync main to slaves completed successfully")
								}

								// Extra safety: Disable backup ports on all active slaves
								if slaves, serr := routerSvc.ListActive(ctx); serr == nil {
									for _, sl := range slaves {
										if sl.Role == "slave" && sl.SlavePort != "" {
											go func(slRouter mikrotik.Router) {
												slClient := mikrotik.NewClient(slRouter.Host, slRouter.Username, slRouter.Password)
												if err := slClient.Connect(context.Background()); err == nil {
													defer slClient.Close()
													if err := slClient.SetInterfaceDisabled(context.Background(), slRouter.SlavePort, true); err != nil {
														s.Logger.Error("failed to disable backup port on slave router", "slave", slRouter.Name, "port", slRouter.SlavePort, "error", err)
													} else {
														s.Logger.Info("disabled backup port on slave router due to main recovery", "slave", slRouter.Name, "port", slRouter.SlavePort)
													}
												}
											}(sl)
										}
									}
								}
							}
						}
						_ = routerSvc.UpdateOnlineStatus(ctx, r.ID, true)
					}

					if activeList, err := client.ListActiveConnections(ctx); err == nil {
						for _, act := range activeList {
							activePPPMap[strings.ToLower(strings.TrimSpace(act.Name))] = act
						}
					}
					client.Close()
				} else {
					s.Logger.Error("worker status pooling: failed to connect to router", "router", r.Name, "host", r.Host, "error", err)
					// Check online -> offline transition
					if r.IsOnline {
						s.Logger.Warn("Router transitioned from online to offline", "router", r.Name, "host", r.Host, "error", err)
						_ = routerSvc.UpdateOnlineStatus(ctx, r.ID, false)

						// Enable backup ports on all active slaves if Main goes down
						if r.Role == "main" {
							if slaves, serr := routerSvc.ListActive(ctx); serr == nil {
								for _, sl := range slaves {
									if sl.Role == "slave" && sl.SlavePort != "" {
										go func(slRouter mikrotik.Router) {
											slClient := mikrotik.NewClient(slRouter.Host, slRouter.Username, slRouter.Password)
											if err := slClient.Connect(context.Background()); err == nil {
												defer slClient.Close()
												if err := slClient.SetInterfaceDisabled(context.Background(), slRouter.SlavePort, false); err != nil {
													s.Logger.Error("failed to enable backup port on slave router", "slave", slRouter.Name, "port", slRouter.SlavePort, "error", err)
												} else {
													s.Logger.Info("enabled backup port on slave router because main went offline", "slave", slRouter.Name, "port", slRouter.SlavePort)
												}
											}
										}(sl)
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Fallback to legacy single router if activePPPMap is empty
	if len(activePPPMap) == 0 {
		mikrotikHost, _ := s.Settings.GetString(ctx, settings.KeyMikrotikHost)
		mikrotikUser, _ := s.Settings.GetString(ctx, settings.KeyMikrotikUser)
		mikrotikPass, _ := s.Settings.GetString(ctx, settings.KeyMikrotikPass)
		if strings.TrimSpace(mikrotikHost) != "" && strings.TrimSpace(mikrotikUser) != "" {
			client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
			if err := client.Connect(ctx); err == nil {
				defer client.Close()
				activeList, err := client.ListActiveConnections(ctx)
				if err == nil {
					for _, act := range activeList {
						activePPPMap[strings.ToLower(strings.TrimSpace(act.Name))] = act
					}
				} else {
					s.Logger.Error("worker status pooling legacy fallback: failed to list active connections", "error", err)
				}
			} else {
				s.Logger.Error("worker status pooling legacy fallback: failed to connect to legacy MikroTik", "error", err)
			}
		}
	}

	// 2. Setup GenieACS Client
	acsURL, err := s.Settings.GetString(ctx, settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := s.Settings.GetString(ctx, settings.KeyACSUsername)
	acsPass, _ := s.Settings.GetString(ctx, settings.KeyACSPassword)
	acsClient := acs.NewClient(acsURL, acsUser, acsPass)

	type checkResult struct {
		customer customers.Customer
		modified bool
	}

	numWorkers := 15
	if len(cList) < numWorkers {
		numWorkers = len(cList)
	}

	tasksChan := make(chan customers.Customer, len(cList))
	resultsChan := make(chan checkResult, len(cList))

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for cust := range tasksChan {
				modified := false
				wasPppoeOnline := cust.PppoeStatus == "online" || cust.PppoeStatus == "limit"
				wasOntOnline := cust.OntStatus == "online"

				// Determine PPPoE Status
				pppoeUsername := strings.ToLower(strings.TrimSpace(cust.UserPPPoE))
				isPppoeOnline := false
				if pppoeUsername != "" {
					if active, ok := activePPPMap[pppoeUsername]; ok {
						isPppoeOnline = true
						statusVal := "online"
						if cust.Status == "limit" {
							statusVal = "limit"
						}
						if cust.PppoeStatus != statusVal || cust.PppoeIP != active.Address || cust.PppoeUptime != active.Uptime {
							cust.PppoeStatus = statusVal
							cust.PppoeIP = active.Address
							cust.PppoeUptime = active.Uptime
							modified = true
						}
					} else {
						// Offline or unconfigured/inactive
						statusVal := "offline"
						if cust.PppoeStatus != statusVal || cust.PppoeIP != "" || cust.PppoeUptime != "" {
							cust.PppoeStatus = statusVal
							cust.PppoeIP = ""
							cust.PppoeUptime = ""
							modified = true
						}
					}
				} else {
					if cust.PppoeStatus != "" {
						cust.PppoeStatus = ""
						cust.PppoeIP = ""
						cust.PppoeUptime = ""
						modified = true
					}
				}

				// Determine GenieACS Status
				serialNum := strings.TrimSpace(cust.SNOnt)
				isOntOnline := false
				var status acs.DeviceStatus
				var err error
				if serialNum != "" {
					// Query device status from GenieACS Client
					status, err = acsClient.GetDeviceStatus(ctx, serialNum)
					if err == nil {
						isOntOnline = status.Status == "online"
						if cust.OntStatus != status.Status || cust.OntIP != status.IPAddress || cust.OntUptime != status.Uptime || cust.OntRxPower != status.RxOpticalPower || cust.OntTxPower != status.TxOpticalPower {
							cust.OntStatus = status.Status
							cust.OntIP = status.IPAddress
							cust.OntUptime = status.Uptime
							cust.OntRxPower = status.RxOpticalPower
							cust.OntTxPower = status.TxOpticalPower
							modified = true
						}
					} else {
						s.Logger.Error("worker status pooling: failed to get device ONT status from GenieACS", "serial", serialNum, "error", err)
						isOntOnline = wasOntOnline // Preserve previous state to prevent false offline alerts
					}
				} else {
					if cust.OntStatus != "" {
						cust.OntStatus = ""
						cust.OntIP = ""
						cust.OntUptime = ""
						cust.OntRxPower = ""
						cust.OntTxPower = ""
						modified = true
					}
				}

				// Aggregate State Calculation for Discord Alert
				hasPppoe := pppoeUsername != ""
				hasOnt := serialNum != ""

				// To prevent alert fatigue, we base the "connection state" primarily on MikroTik (PPPoE).
				// If PPPoE is down, Internet is definitely down. 
				// If PPPoE is up but GenieACS is down, it's likely a false positive or just TR069 timeout.
				var wasConnected bool
				var isConnected bool

				if hasPppoe {
					wasConnected = wasPppoeOnline
					isConnected = isPppoeOnline
				} else if hasOnt {
					wasConnected = wasOntOnline
					isConnected = isOntOnline
				} else {
					wasConnected = true
					isConnected = true
				}

				// Only trigger alert if the primary connection state transitioned
				if isConnected != wasConnected {
					if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_gacs_offline") {
						var statusStr string
						var color int
						var titleStr string

						if !isConnected {
							titleStr = "🚨 KONEKSI TERPUTUS (OFFLINE) 🚨"
							if hasPppoe {
								statusStr = "DISCONNECTED 🔴 (Koneksi Internet / MikroTik Terputus)"
							} else {
								statusStr = "DOWN 🔴 (Koneksi Perangkat / ONT Terputus)"
							}
							color = 15158332 // Red
						} else {
							titleStr = "✅ KONEKSI PULIH (ONLINE) ✅"
							statusStr = "ONLINE 🟢 (Koneksi Internet Normal)"
							color = 3066993 // Green
						}
						waktuKejadian := time.Now().Format("2006-01-02 15:04:05")
						rxPower := cust.OntRxPower
						txPower := cust.OntTxPower
						if hasOnt && err == nil {
							rxPower = status.RxOpticalPower
							txPower = status.TxOpticalPower
						}

						embed := notifications.DiscordEmbed{
							Title:       titleStr,
							Description: fmt.Sprintf("Update status koneksi untuk pelanggan **%s**.", cust.Name),
							Color:       color,
							Fields: []notifications.EmbedField{
								{Name: "Nama Pelanggan", Value: cust.Name, Inline: true},
								{Name: "User PPPoE", Value: cust.UserPPPoE, Inline: true},
								{Name: "Serial Number (SN)", Value: cust.SNOnt, Inline: true},
								{Name: "Waktu Kejadian", Value: waktuKejadian, Inline: true},
								{Name: "Redaman Terakhir (Rx)", Value: fmt.Sprintf("%s (Tx: %s)", rxPower, txPower), Inline: false},
								{Name: "Status Terdeteksi", Value: statusStr, Inline: false},
							},
						}

						go func(emb notifications.DiscordEmbed) {
							_ = s.Discord.SendEmbed(context.Background(), emb)
						}(embed)
					}
				}

				resultsChan <- checkResult{customer: cust, modified: modified}
			}
		}()
	}

	// Queue all customers
	for _, customer := range cList {
		tasksChan <- customer
	}
	close(tasksChan)

	// Close results channel when workers are done
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// Collect results and apply database updates sequentially
	for res := range resultsChan {
		if res.modified {
			res.customer.LastSyncAt = now.Format(time.RFC3339)
			if err := s.Customers.UpdateSyncFields(ctx, res.customer.ID, res.customer); err != nil {
				s.Logger.Error("worker status pooling: failed to update customer status in database", "customer_id", res.customer.ID, "error", err)
			}
		}
	}

	return nil
}

func (s Service) runScheduledMikrotikSync(ctx context.Context, now time.Time) error {
	syncHours, err := s.Settings.GetInt(ctx, "mikrotik_auto_sync_hours")
	if err != nil || syncHours <= 0 {
		return nil
	}

	lastSyncStr, _ := s.Settings.GetString(ctx, "mikrotik_last_auto_sync_at")
	if lastSyncStr != "" {
		if lastSync, err := time.Parse(time.RFC3339, lastSyncStr); err == nil {
			if now.Sub(lastSync) < time.Duration(syncHours)*time.Hour {
				return nil
			}
		}
	}

	s.Logger.Info("Scheduled MikroTik sync starting", "interval_hours", syncHours)
	routerSvc := mikrotik.NewRouterService(s.DB)
	if _, err := routerSvc.SyncMainToSlaves(ctx); err != nil {
		s.Logger.Error("Scheduled MikroTik sync failed", "error", err)
		return err
	}

	s.Logger.Info("Scheduled MikroTik sync completed successfully")
	_ = s.Settings.Set(ctx, "mikrotik_last_auto_sync_at", now.UTC().Format(time.RFC3339))
	return nil
}
