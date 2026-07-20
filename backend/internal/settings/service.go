package settings

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultWAGatewayURL       = "http://127.0.0.1:3001"
	LegacyDefaultWAGatewayURL = "http://localhost:3001"

	KeyReminderDays                      = "billing_reminder_days"
	KeyLimitDays                         = "billing_limit_days"
	KeyMenunggakDays                     = "billing_menunggak_days"
	KeyTrialGraceDays                    = "trial_overdue_grace_days"
	KeyTrialPeriodDays                   = "trial_period_days"
	KeyTrialAutoGenerate                 = "trial_auto_generate_bills"
	KeyTrialEnabled                      = "trial_enabled"
	KeyBillingAutoEnabled                = "billing_auto_generate_enabled"
	KeyBillingGenerateDay                = "billing_generate_day"
	KeyBillingGenerateTime               = "billing_generate_time"
	KeyBillingRetryAttempts              = "billing_generate_retry_attempts"
	KeyBillingRetryBackoff               = "billing_generate_retry_backoff_seconds"
	KeyWAGatewayURL                      = "wa_gateway_url"
	KeyWAAccountID                       = "wa_account_id"
	KeyWABillingAccountID                = "wa_billing_account_id"
	KeyWAReminderAccountID               = "wa_reminder_account_id"
	KeyWADueAccountID                    = "wa_due_account_id"
	KeyWALimitAccountID                  = "wa_limit_account_id"
	KeyWAPaymentAccountID                = "wa_payment_account_id"
	KeyWAAPIKey                          = "wa_api_key"
	KeyWorkerIntervalSecs                = "worker_interval_seconds"
	KeyWorkerLockTTLSeconds              = "worker_lock_ttl_seconds"
	KeyBackupAutoEnabled                 = "backup_auto_enabled"
	KeyBackupAutoTime                    = "backup_auto_time"
	KeyBackupRetentionCount              = "backup_retention_count"
	KeyDiscordWebhookURL                 = "discord_webhook_url"
	KeyDiscordNotifyPayment              = "discord_notify_payment"
	KeyDiscordNotifyGenerate             = "discord_notify_generate"
	KeyDiscordNotifyWorker               = "discord_notify_worker"
	KeyDiscordNotifyGacsOffline          = "discord_notify_gacs_offline"
	KeyDiscordBotToken                   = "discord_bot_token"
	KeyDiscordBotApplicationID           = "discord_bot_application_id"
	KeyDiscordBotGuildID                 = "discord_bot_guild_id"
	KeyMikrotikHost                      = "mikrotik_host"
	KeyMikrotikUser                      = "mikrotik_user"
	KeyMikrotikPass                      = "mikrotik_pass"
	KeyMikrotikTestUsername              = "mikrotik_test_username"
	KeyChatbotTriggerBilling             = "chatbot_trigger_billing"
	KeyChatbotTriggerRegister            = "chatbot_trigger_register"
	KeyChatbotTriggerSupport             = "chatbot_trigger_support"
	KeyChatbotTriggerPackages            = "chatbot_trigger_packages"
	KeyChatbotTriggerFAQ                 = "chatbot_trigger_faq"
	KeyChatbotTriggerAdmin               = "chatbot_trigger_admin"
	KeyACSURL                            = "acs_url"
	KeyACSUsername                       = "acs_username"
	KeyACSPassword                       = "acs_password"
	KeyGacsRxPowerExcellent              = "gacs_rx_power_excellent"
	KeyGacsRxPowerFair                   = "gacs_rx_power_fair"
	KeyGacsPortalAPIKey                  = "gacs_portal_api_key"
	KeySMTPHost                          = "smtp_host"
	KeySMTPPort                          = "smtp_port"
	KeySMTPUsername                      = "smtp_username"
	KeySMTPPassword                      = "smtp_password"
	KeySMTPFromEmail                     = "smtp_from_email"
	KeySMTPEncryption                    = "smtp_encryption"
	KeySMTPEnabled                       = "smtp_enabled"
	KeyMikrotikIsolirProfile             = "mikrotik_isolir_profile"
	KeyMikrotikInactiveProfile           = "mikrotik_inactive_profile"
	KeyWAGatewayEnabled                  = "wa_gateway_enabled"
	KeyDiscordBotEnabled                 = "discord_bot_enabled"
	KeyMikrotikAutoSyncHours             = "mikrotik_auto_sync_hours"
	KeyMikrotikLastAutoSyncAt            = "mikrotik_last_auto_sync_at"
	KeyWAChatbotEnabled                  = "wa_chatbot_enabled"
	KeyInactiveSuspendedDays             = "billing_inactive_suspended_days"
	KeyWAQueueThrottleSeconds            = "wa_queue_throttle_seconds"
	KeyMikrotikDeleteUnregisteredSecrets = "mikrotik_delete_unregistered"
	KeyBackupEncryptionPassword          = "backup_encryption_password"
	KeyBackupDiscordChannelID            = "backup_discord_channel_id"
	KeyBackupEncryptionEnabled          = "backup_encryption_enabled"
)

var defaults = map[string]string{
	KeyMikrotikDeleteUnregisteredSecrets: "0",
	KeyReminderDays:                      "3",
	KeyLimitDays:                         "5",
	KeyMenunggakDays:                     "30",
	KeyInactiveSuspendedDays:             "20",
	KeyWAQueueThrottleSeconds:            "120",
	KeyTrialGraceDays:                    "5",
	KeyTrialPeriodDays:                   "3",
	KeyTrialAutoGenerate:                 "1",
	KeyTrialEnabled:                      "1",
	KeyBillingAutoEnabled:                "1",
	KeyBillingGenerateDay:                "1",
	KeyBillingGenerateTime:               "00:05",
	KeyBillingRetryAttempts:              "3",
	KeyBillingRetryBackoff:               "2",
	KeyWAGatewayURL:                      DefaultWAGatewayURL,
	KeyWAAccountID:                       "default",
	KeyWABillingAccountID:                "",
	KeyWAReminderAccountID:               "",
	KeyWADueAccountID:                    "",
	KeyWALimitAccountID:                  "",
	KeyWAPaymentAccountID:                "",
	KeyWAAPIKey:                          "",
	KeyWorkerIntervalSecs:                "60",
	KeyWorkerLockTTLSeconds:              "180",
	KeyBackupAutoEnabled:                 "1",
	KeyBackupAutoTime:                    "02:00",
	KeyBackupRetentionCount:              "3",
	KeyBackupEncryptionPassword:          "",
	KeyBackupDiscordChannelID:            "",
	KeyBackupEncryptionEnabled:           "1",
	KeyDiscordWebhookURL:                 "",
	KeyDiscordNotifyPayment:              "1",
	KeyDiscordNotifyGenerate:             "1",
	KeyDiscordNotifyWorker:               "1",
	KeyDiscordNotifyGacsOffline:          "1",
	KeyDiscordBotToken:                   "",
	KeyDiscordBotApplicationID:           "",
	KeyDiscordBotGuildID:                 "",
	KeyMikrotikHost:                      "",
	KeyMikrotikUser:                      "",
	KeyMikrotikPass:                      "",
	KeyMikrotikTestUsername:              "test-user",
	KeyMikrotikIsolirProfile:             "isolir",
	KeyMikrotikInactiveProfile:           "nonaktif",
	KeyMikrotikAutoSyncHours:             "0",
	KeyChatbotTriggerBilling:             "1",
	KeyChatbotTriggerRegister:            "1",
	KeyChatbotTriggerSupport:             "2",
	KeyChatbotTriggerPackages:            "3",
	KeyChatbotTriggerFAQ:                 "4",
	KeyChatbotTriggerAdmin:               "5",
	KeyACSURL:                            "",
	KeyACSUsername:                       "",
	KeyACSPassword:                       "",
	KeyGacsRxPowerExcellent:              "-27",
	KeyGacsRxPowerFair:                   "-25",
	KeyGacsPortalAPIKey:                  "",
	KeySMTPHost:                          "",
	KeySMTPPort:                          "587",
	KeySMTPUsername:                      "",
	KeySMTPPassword:                      "",
	KeySMTPFromEmail:                     "",
	KeySMTPEncryption:                    "tls",
	KeySMTPEnabled:                       "0",
	KeyWAGatewayEnabled:                  "0",
	KeyDiscordBotEnabled:                 "0",
	KeyWAChatbotEnabled:                  "1",
	"appName":                            "Menet-Tech Dashboard Go",
	"portalApiKey":                       "",
	"vpPppoeUsername":                    "VirtualParameters.pppoeUsername",
	"vpWanBridge":                        "VirtualParameters.wanBridge",
	"vpRxPower":                          "VirtualParameters.RXPower",
	"vpTemperature":                      "VirtualParameters.gettemp",
	"vpActiveDevices":                    "VirtualParameters.activedevices",
	"vpSuperAdmin":                       "VirtualParameters.superAdmin",
	"vpSuperPassword":                    "VirtualParameters.superPassword",
	"vpUserAdmin":                        "VirtualParameters.userAdmin",
	"vpUserPassword":                     "VirtualParameters.userPassword",
	"rxPowerThresholds":                  "{}",
	"autoRefreshIntervals":               "{}",
}

func IsDefaultWAGatewayURL(value string) bool {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "/")
	return trimmed == "" || trimmed == DefaultWAGatewayURL || trimmed == LegacyDefaultWAGatewayURL
}

func ResolveWAGatewayURL(value string) string {
	if envValue := strings.TrimSpace(os.Getenv("WA_GATEWAY_URL")); envValue != "" && (IsDefaultWAGatewayURL(value) || strings.TrimSpace(value) == "") {
		return envValue
	}
	if IsDefaultWAGatewayURL(value) || strings.TrimSpace(value) == "" {
		return DefaultWAGatewayURL
	}
	return strings.TrimSpace(value)
}

func IsAllowedKey(key string) bool {
	_, ok := defaults[key]
	if ok {
		return true
	}
	switch {
	case strings.HasPrefix(key, "worker_"):
		return true
	case strings.HasPrefix(key, "chatbot_trigger_"):
		return true
	default:
		return false
	}
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) resolveWAAPIKeyFallback(ctx context.Context) string {
	for _, envKey := range []string{"DASHBOARD_INTERNAL_API_KEY", "WA_API_KEY", "API_KEY"} {
		if envVal := strings.TrimSpace(os.Getenv(envKey)); envVal != "" {
			_ = s.Repository.Set(ctx, KeyWAAPIKey, envVal)
			return envVal
		}
	}
	paths := []string{
		"/opt/menettech-go/whatsapp/.env",
		"/opt/menettech-go/integration/whatsapp/.env",
		"/opt/menettech-go/backend/.env",
		"../whatsapp/.env",
		"../../whatsapp/.env",
		"../integration/whatsapp/.env",
		"../../integration/whatsapp/.env",
		"../../../integration/whatsapp/.env",
		"whatsapp/.env",
	}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			key := strings.TrimSpace(parts[0])
			val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
			if (key == "API_KEY" || key == "DASHBOARD_INTERNAL_API_KEY") && val != "" {
				_ = s.Repository.Set(ctx, KeyWAAPIKey, val)
				return val
			}
		}
	}
	return ""
}

func (s Service) GetString(ctx context.Context, key string) (string, error) {
	value, err := s.Repository.GetString(ctx, key)
	if err == nil {
		if key == KeyWAAPIKey && strings.TrimSpace(value) == "" {
			if fb := s.resolveWAAPIKeyFallback(ctx); fb != "" {
				return fb, nil
			}
		}
		return value, nil
	}
	if err == sql.ErrNoRows {
		if key == KeyWAAPIKey {
			if fb := s.resolveWAAPIKeyFallback(ctx); fb != "" {
				return fb, nil
			}
		}
		return defaults[key], nil
	}
	return "", err
}

func (s Service) GetInt(ctx context.Context, key string) (int, error) {
	value, err := s.GetString(ctx, key)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(value) == "" {
		value = defaults[key]
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		fallback, _ := strconv.Atoi(defaults[key])
		return fallback, nil
	}
	return parsed, nil
}

func (s Service) GetAll(ctx context.Context) (map[string]string, error) {
	dbSettings, err := s.Repository.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	result := make(map[string]string)
	for k, v := range defaults {
		result[k] = v
	}
	for k, v := range dbSettings {
		result[k] = v
	}
	if strings.TrimSpace(result[KeyWAAPIKey]) == "" {
		if fb := s.resolveWAAPIKeyFallback(ctx); fb != "" {
			result[KeyWAAPIKey] = fb
		}
	}
	return result, nil
}

func (s Service) Set(ctx context.Context, key, value string) error {
	if !IsAllowedKey(key) {
		return fmt.Errorf("unknown setting key: %s", key)
	}
	return s.Repository.Set(ctx, key, value)
}

func (s Service) TryAcquireLease(ctx context.Context, leaseKey, owner string, until string) (bool, error) {
	return s.Repository.TryAcquireLease(ctx, leaseKey, owner, until)
}

func (s Service) ReleaseLease(ctx context.Context, leaseKey, owner string) error {
	return s.Repository.ReleaseLease(ctx, leaseKey, owner)
}

func (s Service) Delete(ctx context.Context, key string) error {
	return s.Repository.Delete(ctx, key)
}

func (r Repository) GetString(ctx context.Context, key string) (string, error) {
	row := r.DB.QueryRowContext(ctx, `SELECT value FROM pengaturan WHERE key = ? LIMIT 1`, key)
	var value string
	if err := row.Scan(&value); err != nil {
		return "", err
	}
	return value, nil
}

func (r Repository) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT key, value FROM pengaturan`)
	if err != nil {
		return nil, fmt.Errorf("get all settings: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("scan setting: %w", err)
		}
		result[key] = value
	}
	return result, rows.Err()
}

func (r Repository) Set(ctx context.Context, key, value string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO pengaturan(key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, key, value)
	if err != nil {
		return fmt.Errorf("set setting %s: %w", key, err)
	}
	return nil
}

func (r Repository) Delete(ctx context.Context, key string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM pengaturan WHERE key = ?`, key)
	if err != nil {
		return fmt.Errorf("delete setting %s: %w", key, err)
	}
	return nil
}

func (r Repository) TryAcquireLease(ctx context.Context, leaseKey, owner string, until string) (bool, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin lease tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	currentOwner, currentUntil, err := getLeaseState(ctx, tx, leaseKey)
	if err != nil {
		return false, err
	}
	if currentOwner != "" && currentOwner != owner && !leaseExpired(currentUntil) {
		return false, nil
	}

	if err := upsertTxSetting(ctx, tx, leaseKey+"_owner", owner); err != nil {
		return false, err
	}
	if err := upsertTxSetting(ctx, tx, leaseKey+"_until", until); err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit lease tx: %w", err)
	}
	return true, nil
}

func (r Repository) ReleaseLease(ctx context.Context, leaseKey, owner string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin release lease tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	currentOwner, _, err := getLeaseState(ctx, tx, leaseKey)
	if err != nil {
		return err
	}
	if currentOwner != "" && currentOwner != owner {
		return nil
	}

	if err := upsertTxSetting(ctx, tx, leaseKey+"_owner", ""); err != nil {
		return err
	}
	if err := upsertTxSetting(ctx, tx, leaseKey+"_until", ""); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit release lease tx: %w", err)
	}
	return nil
}

func getLeaseState(ctx context.Context, tx *sql.Tx, leaseKey string) (string, string, error) {
	currentOwner, err := getTxSetting(ctx, tx, leaseKey+"_owner")
	if err != nil {
		return "", "", err
	}
	currentUntil, err := getTxSetting(ctx, tx, leaseKey+"_until")
	if err != nil {
		return "", "", err
	}
	return currentOwner, currentUntil, nil
}

func getTxSetting(ctx context.Context, tx *sql.Tx, key string) (string, error) {
	row := tx.QueryRowContext(ctx, `SELECT value FROM pengaturan WHERE key = ? LIMIT 1`, key)
	var value string
	if err := row.Scan(&value); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("get tx setting %s: %w", key, err)
	}
	return value, nil
}

func upsertTxSetting(ctx context.Context, tx *sql.Tx, key, value string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO pengaturan(key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, key, value)
	if err != nil {
		return fmt.Errorf("upsert tx setting %s: %w", key, err)
	}
	return nil
}

func leaseExpired(until string) bool {
	if strings.TrimSpace(until) == "" {
		return true
	}
	expiresAt, err := time.Parse(time.RFC3339, until)
	if err != nil {
		return true
	}
	return !expiresAt.After(time.Now().UTC())
}
