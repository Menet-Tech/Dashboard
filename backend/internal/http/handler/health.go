package handler

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/acs"
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
	lastCycleAt, _ := h.Settings.GetString(ctx, "worker_last_cycle_at")
	lastCycleError, _ := h.Settings.GetString(ctx, "worker_last_cycle_error")
	intervalSecs, _ := h.Settings.GetInt(ctx, settings.KeyWorkerIntervalSecs)
	backupEnabledValue, _ := h.Settings.GetString(ctx, settings.KeyBackupAutoEnabled)
	backupTime, _ := h.Settings.GetString(ctx, settings.KeyBackupAutoTime)
	backupRetention, _ := h.Settings.GetInt(ctx, settings.KeyBackupRetentionCount)
	lastBackupAt, _ := h.Settings.GetString(ctx, "worker_last_backup_at")
	lastBackupDate, _ := h.Settings.GetString(ctx, "worker_last_backup_date")
	if strings.TrimSpace(lastBackupDate) == "" {
		lastBackupDate = backupDateFromTimestamp(lastBackupAt)
	}
	lastBackupFilename, _ := h.Settings.GetString(ctx, "worker_last_backup_filename")
	billingAutoEnabledValue, _ := h.Settings.GetString(ctx, settings.KeyBillingAutoEnabled)
	billingDay, _ := h.Settings.GetInt(ctx, settings.KeyBillingGenerateDay)
	billingTime, _ := h.Settings.GetString(ctx, settings.KeyBillingGenerateTime)
	billingRetryAttempts, _ := h.Settings.GetInt(ctx, settings.KeyBillingRetryAttempts)
	billingRetryBackoff, _ := h.Settings.GetInt(ctx, settings.KeyBillingRetryBackoff)
	billingLastAttemptAt, _ := h.Settings.GetString(ctx, "worker_billing_last_attempt_at")
	billingLastRunAt, _ := h.Settings.GetString(ctx, "worker_billing_last_run_at")
	billingLastPeriod, _ := h.Settings.GetString(ctx, "worker_billing_last_period")
	billingLastSuccessPeriod, _ := h.Settings.GetString(ctx, "worker_billing_last_success_period")
	billingLastGeneratedCount, _ := h.Settings.GetString(ctx, "worker_billing_last_generated_count")
	billingLastError, _ := h.Settings.GetString(ctx, "worker_billing_last_error")
	billingRetryCount, _ := h.Settings.GetString(ctx, "worker_billing_retry_count")
	billingNextRun, _ := h.Settings.GetString(ctx, "worker_billing_next_run")
	waGatewayURL, _ := h.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	waAPIKey, _ := h.Settings.GetString(ctx, settings.KeyWAAPIKey)
	discordWebhookURL, _ := h.Settings.GetString(ctx, settings.KeyDiscordWebhookURL)
	mikrotikHost, _ := h.Settings.GetString(ctx, settings.KeyMikrotikHost)
	mikrotikUser, _ := h.Settings.GetString(ctx, settings.KeyMikrotikUser)
	mikrotikPass, _ := h.Settings.GetString(ctx, settings.KeyMikrotikPass)
	acsURL, _ := h.Settings.GetString(ctx, settings.KeyACSURL)
	acsUsername, _ := h.Settings.GetString(ctx, settings.KeyACSUsername)
	acsPassword, _ := h.Settings.GetString(ctx, settings.KeyACSPassword)
	billingAutoEnabled := strings.TrimSpace(billingAutoEnabledValue) != "0"

	// Treat empty URL or the bare localhost default as configured since the service manager
	// defaults to http://localhost:3001 when empty. A non-empty API key is required.
	waURLTrimmed := strings.TrimSpace(waGatewayURL)
	waConfigured := strings.TrimSpace(waAPIKey) != ""

	// Apply localhost fallback only for the actual HTTP reachability check.
	if waURLTrimmed == "" {
		waGatewayURL = "http://localhost:3001"
	}

	discordConfigured := strings.TrimSpace(discordWebhookURL) != ""
	mikrotikConfigured := strings.TrimSpace(mikrotikHost) != "" &&
		strings.TrimSpace(mikrotikUser) != "" &&
		strings.TrimSpace(mikrotikPass) != ""
	genieACSConfigured := strings.TrimSpace(acsURL) != ""

	dbQuickCheck := "unknown"
	dbQuickCheckMessage := "belum diperiksa"
	if check, err := h.quickCheckDatabase(ctx); err != nil {
		status = "degraded"
		databaseStatus = "error"
		dbQuickCheck = "error"
		dbQuickCheckMessage = err.Error()
		alerts = append(alerts, "database quick check gagal")
		h.Logger.Warn("database quick check failed", "error", err)
	} else {
		dbQuickCheck = check
		dbQuickCheckMessage = "integrity ok"
	}

	dbSizeBytes, _ := h.getDatabaseSize(ctx)

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
	if strings.TrimSpace(lastCycleError) != "" {
		workerStatus = "error"
		status = "degraded"
		alerts = append(alerts, "worker cycle terakhir gagal")
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




	// Real-time online checks
	waOnline := false
	if waConfigured {
		waOnline = checkWhatsAppOnline(ctx, waGatewayURL, waAPIKey)
	}

	discordOnline := false
	if discordConfigured {
		discordOnline = checkDiscordOnline(ctx, discordWebhookURL)
	}

	mikrotikOnline := false
	if mikrotikConfigured {
		mikrotikOnline = checkMikrotikOnline(mikrotikHost)
	}

	genieACSOnline := false
	if genieACSConfigured {
		genieACSOnline = checkGenieACSOnline(ctx, acsURL, acsUsername, acsPassword)
	}

	if !waConfigured {
		alerts = append(alerts, "konfigurasi WhatsApp belum lengkap")
	} else if !waOnline {
		alerts = append(alerts, "koneksi WhatsApp gateway terputus (offline)")
	}

	if !discordConfigured {
		alerts = append(alerts, "konfigurasi Discord belum lengkap")
	} else if !discordOnline {
		alerts = append(alerts, "koneksi webhook Discord bermasalah (offline)")
	}

	if !mikrotikConfigured {
		alerts = append(alerts, "konfigurasi MikroTik belum lengkap")
	} else if !mikrotikOnline {
		alerts = append(alerts, "koneksi router MikroTik terputus (offline)")
	}

	if !genieACSConfigured {
		alerts = append(alerts, "konfigurasi GenieACS belum lengkap")
	} else if !genieACSOnline {
		alerts = append(alerts, "koneksi GenieACS bermasalah (offline)")
	}

	if billingAutoEnabled && strings.TrimSpace(billingLastError) != "" {
		status = "degraded"
		alerts = append(alerts, "generate tagihan otomatis terakhir gagal")
	}

	WriteJSON(w, http.StatusOK, map[string]any{
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
		"database": map[string]any{
			"size_bytes": dbSizeBytes,
			"quick_check": map[string]string{
				"status":  dbQuickCheck,
				"message": dbQuickCheckMessage,
			},
		},
		"worker": map[string]any{
			"last_heartbeat":   lastHeartbeatStr,
			"last_cycle_at":    lastCycleAt,
			"last_cycle_error": lastCycleError,
			"interval_seconds": intervalSecs,
		},
		"scheduler": map[string]any{
			"billing_auto_enabled":          billingAutoEnabled,
			"billing_generate_day":          billingDay,
			"billing_generate_time":         billingTime,
			"billing_retry_attempts":        billingRetryAttempts,
			"billing_retry_backoff_seconds": billingRetryBackoff,
			"billing_last_attempt_at":       billingLastAttemptAt,
			"billing_last_run_at":           billingLastRunAt,
			"billing_last_period":           billingLastPeriod,
			"billing_last_success_period":   billingLastSuccessPeriod,
			"billing_last_generated_count":  atoiDefault(billingLastGeneratedCount, 0),
			"billing_last_error":            billingLastError,
			"billing_retry_count":           atoiDefault(billingRetryCount, 0),
			"billing_next_run":              billingNextRun,
		},
		"backup": map[string]any{
			"enabled":         backupEnabled,
			"scheduled_time":  backupTime,
			"last_run_date":   lastBackupDate,
			"last_run_at":     lastBackupAt,
			"last_filename":   lastBackupFilename,
			"retention_count": backupRetention,
		},
		"integrations": map[string]any{
			"whatsapp_configured": waConfigured,
			"whatsapp_online":     waOnline,
			"discord_configured":  discordConfigured,
			"discord_online":      discordOnline,
			"mikrotik_configured": mikrotikConfigured,
			"mikrotik_online":     mikrotikOnline,
			"genieacs_configured": genieACSConfigured,
			"genieacs_online":     genieACSOnline,
		},
		"alerts":    alerts,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func (h HealthHandler) quickCheckDatabase(ctx context.Context) (string, error) {
	row := h.DB.QueryRowContext(ctx, `PRAGMA quick_check;`)
	var result string
	if err := row.Scan(&result); err != nil {
		return "error", fmt.Errorf("quick check scan: %w", err)
	}
	if strings.EqualFold(strings.TrimSpace(result), "ok") {
		return "ok", nil
	}
	return "error", fmt.Errorf("quick check result: %s", result)
}

func (h HealthHandler) getDatabaseSize(ctx context.Context) (int64, error) {
	var pageCount, pageSize int64
	if err := h.DB.QueryRowContext(ctx, "PRAGMA page_count").Scan(&pageCount); err != nil {
		return 0, err
	}
	if err := h.DB.QueryRowContext(ctx, "PRAGMA page_size").Scan(&pageSize); err != nil {
		return 0, err
	}
	return pageCount * pageSize, nil
}

func contextWithTimeout(r *http.Request, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), timeout)
}

func (h HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func (h HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 2*time.Second)
	defer cancel()

	if err := h.DB.PingContext(ctx); err != nil {
		WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":    "error",
			"message":   "database not ready",
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"message":   "ready",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func backupDateFromTimestamp(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return ""
	}
	return parsed.UTC().Format("2006-01-02")
}

func atoiDefault(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return parsed
}

func checkWhatsAppOnline(ctx context.Context, gatewayURL string, apiKey string) bool {
	if strings.TrimSpace(gatewayURL) == "" {
		return false
	}
	cleanURL := strings.TrimRight(gatewayURL, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cleanURL+"/api/v1/accounts", nil)
	if err != nil {
		return false
	}
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}

	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func checkDiscordOnline(ctx context.Context, webhookURL string) bool {
	if strings.TrimSpace(webhookURL) == "" {
		return false
	}
	parsed, err := url.Parse(webhookURL)
	if err != nil {
		return false
	}
	if parsed.Host == "" {
		return false
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, webhookURL, nil)
	if err != nil {
		return false
	}
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func checkMikrotikOnline(host string) bool {
	if strings.TrimSpace(host) == "" {
		return false
	}
	address := host
	if !strings.Contains(host, ":") {
		address = host + ":8728"
	}
	conn, err := net.DialTimeout("tcp", address, 1500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func checkGenieACSOnline(ctx context.Context, acsURL, username, password string) bool {
	if strings.TrimSpace(acsURL) == "" {
		return false
	}
	client := acs.NewClient(acsURL, username, password)
	client.Client.Timeout = 1500 * time.Millisecond
	return client.TestConnection(ctx) == nil
}
