package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName                string
	Environment            string
	HTTPAddr               string
	SQLitePath             string
	StoragePath            string
	SessionCookieName      string
	SessionCookieSecure    bool
	SessionTTL             time.Duration
	LoginMaxAttempts       int
	LoginWindowMinutes     int
	BootstrapAdminUsername string
	BootstrapAdminPassword string
}

func Load() Config {
	return Config{
		AppName:                envOrDefault("APP_NAME", "Menet-Tech Dashboard Go"),
		Environment:            envOrDefault("APP_ENV", "development"),
		HTTPAddr:               envOrDefault("HTTP_ADDR", ":8080"),
		SQLitePath:             cleanSQLitePath(envOrDefault("SQLITE_PATH", filepath.Join("storage", "dashboard.db"))),
		StoragePath:            cleanSQLitePath(envOrDefault("STORAGE_PATH", "storage")),
		SessionCookieName:      envOrDefault("SESSION_COOKIE_NAME", "menettech_session"),
		SessionCookieSecure:    envBoolOrDefault("SESSION_COOKIE_SECURE", envOrDefault("APP_ENV", "development") == "production"),
		SessionTTL:             time.Duration(envIntOrDefault("SESSION_TTL_HOURS", 24)) * time.Hour,
		LoginMaxAttempts:       envIntOrDefault("LOGIN_MAX_ATTEMPTS", 5),
		LoginWindowMinutes:     envIntOrDefault("LOGIN_WINDOW_MINUTES", 15),
		BootstrapAdminUsername: envOrDefault("BOOTSTRAP_ADMIN_USERNAME", "admin"),
		BootstrapAdminPassword: envOrDefault("BOOTSTRAP_ADMIN_PASSWORD", "password"),
	}
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func cleanSQLitePath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}

	return filepath.Clean(path)
}

func envIntOrDefault(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func envBoolOrDefault(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "TRUE", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "no", "NO", "off", "OFF":
		return false
	default:
		return fallback
	}
}

func ValidateForProduction(cfg Config) error {
	if strings.TrimSpace(cfg.Environment) != "production" {
		return nil
	}
	if !cfg.SessionCookieSecure {
		return fmt.Errorf("SESSION_COOKIE_SECURE must be true in production")
	}
	if strings.TrimSpace(cfg.BootstrapAdminPassword) == "" || strings.TrimSpace(cfg.BootstrapAdminPassword) == "password" || strings.TrimSpace(cfg.BootstrapAdminPassword) == "change-me-now" {
		return fmt.Errorf("BOOTSTRAP_ADMIN_PASSWORD must be changed in production")
	}
	if strings.TrimSpace(cfg.SQLitePath) == "" {
		return fmt.Errorf("SQLITE_PATH must not be empty")
	}
	if strings.TrimSpace(cfg.StoragePath) == "" {
		return fmt.Errorf("STORAGE_PATH must not be empty")
	}
	return nil
}
