package settings

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	KeyReminderDays          = "billing_reminder_days"
	KeyLimitDays             = "billing_limit_days"
	KeyMenunggakDays         = "billing_menunggak_days"
	KeyWAGatewayURL          = "wa_gateway_url"
	KeyWAAPIKey              = "wa_api_key"
	KeyWAAccountID           = "wa_account_id"
	KeyWorkerIntervalSecs    = "worker_interval_seconds"
	KeyWorkerLockTTLSeconds  = "worker_lock_ttl_seconds"
	KeyBackupAutoEnabled     = "backup_auto_enabled"
	KeyBackupAutoTime        = "backup_auto_time"
	KeyBackupRetentionCount  = "backup_retention_count"
	KeyDiscordWebhookURL     = "discord_webhook_url"
	KeyDiscordNotifyPayment  = "discord_notify_payment"
	KeyDiscordNotifyGenerate = "discord_notify_generate"
	KeyDiscordNotifyWorker   = "discord_notify_worker"
	KeyMikrotikHost          = "mikrotik_host"
	KeyMikrotikUser          = "mikrotik_user"
	KeyMikrotikPass          = "mikrotik_pass"
	KeyMikrotikTestUsername  = "mikrotik_test_username"
)

var defaults = map[string]string{
	KeyReminderDays:          "3",
	KeyLimitDays:             "5",
	KeyMenunggakDays:         "30",
	KeyWAGatewayURL:          "",
	KeyWAAPIKey:              "",
	KeyWAAccountID:           "default",
	KeyWorkerIntervalSecs:    "60",
	KeyWorkerLockTTLSeconds:  "180",
	KeyBackupAutoEnabled:     "1",
	KeyBackupAutoTime:        "02:00",
	KeyBackupRetentionCount:  "7",
	KeyDiscordWebhookURL:     "",
	KeyDiscordNotifyPayment:  "1",
	KeyDiscordNotifyGenerate: "1",
	KeyDiscordNotifyWorker:   "1",
	KeyMikrotikHost:          "",
	KeyMikrotikUser:          "",
	KeyMikrotikPass:          "",
	KeyMikrotikTestUsername:  "test-user",
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) GetString(ctx context.Context, key string) (string, error) {
	value, err := s.Repository.GetString(ctx, key)
	if err == nil {
		return value, nil
	}
	if err == sql.ErrNoRows {
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
	return result, nil
}

func (s Service) Set(ctx context.Context, key, value string) error {
	return s.Repository.Set(ctx, key, value)
}

func (s Service) TryAcquireLease(ctx context.Context, leaseKey, owner string, until string) (bool, error) {
	return s.Repository.TryAcquireLease(ctx, leaseKey, owner, until)
}

func (s Service) ReleaseLease(ctx context.Context, leaseKey, owner string) error {
	return s.Repository.ReleaseLease(ctx, leaseKey, owner)
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
