package config

import (
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("APP_NAME", "")
	t.Setenv("APP_ENV", "")
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("SQLITE_PATH", "")
	t.Setenv("STORAGE_PATH", "")
	t.Setenv("SESSION_COOKIE_NAME", "")
	t.Setenv("SESSION_TTL_HOURS", "")
	t.Setenv("BOOTSTRAP_ADMIN_USERNAME", "")
	t.Setenv("BOOTSTRAP_ADMIN_PASSWORD", "")

	cfg := Load()

	if cfg.AppName != "Menet-Tech Dashboard Go" {
		t.Fatalf("expected default app name, got %q", cfg.AppName)
	}

	if cfg.Environment != "development" {
		t.Fatalf("expected default environment, got %q", cfg.Environment)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("expected default http addr, got %q", cfg.HTTPAddr)
	}

	if cfg.SQLitePath != `storage\dashboard.db` && cfg.SQLitePath != "storage/dashboard.db" {
		t.Fatalf("expected default sqlite path, got %q", cfg.SQLitePath)
	}

	if cfg.StoragePath != `storage` {
		t.Fatalf("expected default storage path, got %q", cfg.StoragePath)
	}

	if cfg.SessionCookieName != "menettech_session" {
		t.Fatalf("expected default session cookie name, got %q", cfg.SessionCookieName)
	}

	if cfg.SessionTTL != 24*time.Hour {
		t.Fatalf("expected default session ttl, got %s", cfg.SessionTTL)
	}

	if cfg.BootstrapAdminUsername != "admin" {
		t.Fatalf("expected default bootstrap username, got %q", cfg.BootstrapAdminUsername)
	}

	if cfg.BootstrapAdminPassword != "password" {
		t.Fatalf("expected default bootstrap password, got %q", cfg.BootstrapAdminPassword)
	}
}

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("APP_NAME", "Local Dev")
	t.Setenv("APP_ENV", "test")
	t.Setenv("HTTP_ADDR", ":9999")
	t.Setenv("SQLITE_PATH", "tmp/test.db")
	t.Setenv("STORAGE_PATH", "tmp/storage")
	t.Setenv("SESSION_COOKIE_NAME", "custom_session")
	t.Setenv("SESSION_TTL_HOURS", "12")
	t.Setenv("BOOTSTRAP_ADMIN_USERNAME", "operator")
	t.Setenv("BOOTSTRAP_ADMIN_PASSWORD", "secret")

	cfg := Load()

	if cfg.AppName != "Local Dev" {
		t.Fatalf("expected app name override, got %q", cfg.AppName)
	}

	if cfg.Environment != "test" {
		t.Fatalf("expected environment override, got %q", cfg.Environment)
	}

	if cfg.HTTPAddr != ":9999" {
		t.Fatalf("expected http addr override, got %q", cfg.HTTPAddr)
	}

	if cfg.SQLitePath != `tmp\test.db` && cfg.SQLitePath != "tmp/test.db" {
		t.Fatalf("expected sqlite path override, got %q", cfg.SQLitePath)
	}

	if cfg.StoragePath != `tmp\storage` && cfg.StoragePath != "tmp/storage" {
		t.Fatalf("expected storage path override, got %q", cfg.StoragePath)
	}

	if cfg.SessionCookieName != "custom_session" {
		t.Fatalf("expected cookie name override, got %q", cfg.SessionCookieName)
	}

	if cfg.SessionTTL != 12*time.Hour {
		t.Fatalf("expected ttl override, got %s", cfg.SessionTTL)
	}

	if cfg.BootstrapAdminUsername != "operator" {
		t.Fatalf("expected bootstrap username override, got %q", cfg.BootstrapAdminUsername)
	}

	if cfg.BootstrapAdminPassword != "secret" {
		t.Fatalf("expected bootstrap password override, got %q", cfg.BootstrapAdminPassword)
	}
}

func TestValidateForProduction(t *testing.T) {
	valid := Config{
		Environment:            "production",
		SessionCookieSecure:    true,
		BootstrapAdminPassword: "very-strong-password",
		SQLitePath:             "/opt/menettech-go/storage/dashboard.db",
		StoragePath:            "/opt/menettech-go/storage",
	}
	if err := ValidateForProduction(valid); err != nil {
		t.Fatalf("expected valid config, got error: %v", err)
	}

	invalid := valid
	invalid.SessionCookieSecure = false
	if err := ValidateForProduction(invalid); err == nil {
		t.Fatal("expected error when secure cookie disabled")
	}

	invalid = valid
	invalid.BootstrapAdminPassword = "password"
	if err := ValidateForProduction(invalid); err == nil {
		t.Fatal("expected error when bootstrap password is default")
	}
}
