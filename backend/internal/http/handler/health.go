package handler

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/settings"
)

type HealthHandler struct {
	Config   config.Config
	Logger   *slog.Logger
	DB       *sql.DB
	Settings settings.Service
}

func NewHealthHandler(cfg config.Config, logger *slog.Logger, db *sql.DB, settingsService settings.Service) HealthHandler {
	return HealthHandler{
		Config:   cfg,
		Logger:   logger,
		DB:       db,
		Settings: settingsService,
	}
}

func (h HealthHandler) Show(w http.ResponseWriter, r *http.Request) {
	status := "ok"
	databaseStatus := "ok"
	workerStatus := "ok"
	backupStatus := "idle"
	alerts := make([]string, 0, 8)

	ctx, cancel := contextWithTimeout(r, 2*time.Second)
	defer cancel()

	if err := h.DB.PingContext(ctx); err != nil {
		status = "degraded"
		databaseStatus = "error"
		alerts = append(alerts, "database ping gagal")
		h.Logger.Warn("database ping failed", "error", err)
	}

	lastHeartbeatStr, _ := h.Settings.GetString(ctx, "worker_last_heartbeat")
	intervalSecs, _ := h.Settings.GetInt(ctx, settings.KeyWorkerIntervalSecs)
	backupEnabledValue, _ := h.Settings.GetString(ctx, settings.KeyBackupAutoEnabled)
	backupTime, _ := h.Settings.GetString(ctx, settings.KeyBackupAutoTime)
	backupRetention, _ := h.Settings.GetInt(ctx, settings.KeyBackupRetentionCount)
	lastBackupDate, _ := h.Settings.GetString(ctx, "worker_last_backup_date")
	lastBackupFilename, _ := h.Settings.GetString(ctx, "worker_last_backup_filename")
	waGatewayURL, _ := h.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	waAPIKey, _ := h.Settings.GetString(ctx, settings.KeyWAAPIKey)
	discordWebhookURL, _ := h.Settings.GetString(ctx, settings.KeyDiscordWebhookURL)
	mikrotikHost, _ := h.Settings.GetString(ctx, settings.KeyMikrotikHost)
	mikrotikUser, _ := h.Settings.GetString(ctx, settings.KeyMikrotikUser)
	mikrotikPass, _ := h.Settings.GetString(ctx, settings.KeyMikrotikPass)

	if lastHeartbeatStr != "" {
		if lastRun, err := time.Parse(time.RFC3339, lastHeartbeatStr); err == nil {
			// Add 60 seconds buffer
			if time.Since(lastRun).Seconds() > float64(intervalSecs)+60 {
				workerStatus = "error"
				status = "degraded"
				alerts = append(alerts, "worker heartbeat terlambat")
			}
		}
	} else {
		workerStatus = "unknown"
		alerts = append(alerts, "worker heartbeat belum tercatat")
	}

	backupEnabled := strings.TrimSpace(backupEnabledValue) != "0"
	if !backupEnabled {
		backupStatus = "disabled"
		alerts = append(alerts, "auto backup nonaktif")
	} else if lastBackupDate == time.Now().UTC().Format("2006-01-02") {
		backupStatus = "ok"
	} else {
		alerts = append(alerts, "backup hari ini belum berjalan")
	}

	waConfigured := strings.TrimSpace(waGatewayURL) != "" && strings.TrimSpace(waAPIKey) != ""
	discordConfigured := strings.TrimSpace(discordWebhookURL) != ""
	mikrotikConfigured := strings.TrimSpace(mikrotikHost) != "" &&
		strings.TrimSpace(mikrotikUser) != "" &&
		strings.TrimSpace(mikrotikPass) != ""
	if !waConfigured {
		alerts = append(alerts, "konfigurasi WhatsApp belum lengkap")
	}
	if !discordConfigured {
		alerts = append(alerts, "konfigurasi Discord belum lengkap")
	}
	if !mikrotikConfigured {
		alerts = append(alerts, "konfigurasi MikroTik belum lengkap")
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": status,
		"app": map[string]string{
			"name":        h.Config.AppName,
			"environment": h.Config.Environment,
		},
		"services": map[string]string{
			"database": databaseStatus,
			"worker":   workerStatus,
			"backup":   backupStatus,
		},
		"worker": map[string]any{
			"last_heartbeat":   lastHeartbeatStr,
			"interval_seconds": intervalSecs,
		},
		"backup": map[string]any{
			"enabled":         backupEnabled,
			"scheduled_time":  backupTime,
			"last_run_date":   lastBackupDate,
			"last_filename":   lastBackupFilename,
			"retention_count": backupRetention,
		},
		"integrations": map[string]bool{
			"whatsapp_configured": waConfigured,
			"discord_configured":  discordConfigured,
			"mikrotik_configured": mikrotikConfigured,
		},
		"alerts":    alerts,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func contextWithTimeout(r *http.Request, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), timeout)
}

func (h HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func (h HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 2*time.Second)
	defer cancel()

	if err := h.DB.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":    "error",
			"message":   "database not ready",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"message":   "ready",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
