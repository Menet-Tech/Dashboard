package settings_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/settings"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create settings table: %v", err)
	}

	return db
}

func TestIsAllowedKey(t *testing.T) {
	tests := []struct {
		key     string
		allowed bool
	}{
		{settings.KeyReminderDays, true},
		{"worker_some_custom_state", true},
		{"chatbot_trigger_something", true},
		{"unknown_random_key", false},
	}

	for _, tc := range tests {
		t.Run(tc.key, func(t *testing.T) {
			got := settings.IsAllowedKey(tc.key)
			if got != tc.allowed {
				t.Errorf("expected IsAllowedKey(%q) = %v, got %v", tc.key, tc.allowed, got)
			}
		})
	}
}

func TestSettingsService_GetString(t *testing.T) {
	db := setupTestDB(t)
	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	ctx := context.Background()

	t.Run("Get default value", func(t *testing.T) {
		val, err := svc.GetString(ctx, settings.KeyReminderDays)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "3" {
			t.Errorf("expected default 3, got %q", val)
		}
	})

	t.Run("Get database overridden value", func(t *testing.T) {
		err := svc.Set(ctx, settings.KeyReminderDays, "7")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		val, err := svc.GetString(ctx, settings.KeyReminderDays)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "7" {
			t.Errorf("expected overridden 7, got %q", val)
		}
	})

	t.Run("Get WA API Key fallback to env", func(t *testing.T) {
		t.Setenv("DASHBOARD_INTERNAL_API_KEY", "env-secret-key")

		// Remove from DB to trigger fallback
		_, _ = db.Exec("DELETE FROM pengaturan WHERE key = ?", settings.KeyWAAPIKey)

		val, err := svc.GetString(ctx, settings.KeyWAAPIKey)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "env-secret-key" {
			t.Errorf("expected env fallback 'env-secret-key', got %q", val)
		}
	})

	t.Run("GetAll settings", func(t *testing.T) {
		all, err := svc.GetAll(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if all[settings.KeyReminderDays] != "7" {
			t.Errorf("expected KeyReminderDays = 7, got %q", all[settings.KeyReminderDays])
		}
	})
}

func TestSettingsService_GetInt(t *testing.T) {
	db := setupTestDB(t)
	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	ctx := context.Background()

	t.Run("Get default int", func(t *testing.T) {
		val, err := svc.GetInt(ctx, settings.KeyReminderDays)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != 3 {
			t.Errorf("expected default int 3, got %d", val)
		}
	})

	t.Run("Get custom db value", func(t *testing.T) {
		_ = svc.Set(ctx, settings.KeyReminderDays, "12")
		val, err := svc.GetInt(ctx, settings.KeyReminderDays)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != 12 {
			t.Errorf("expected custom int 12, got %d", val)
		}
	})

	t.Run("Get invalid int fallbacks to default", func(t *testing.T) {
		_ = svc.Set(ctx, settings.KeyReminderDays, "not-a-number")
		val, err := svc.GetInt(ctx, settings.KeyReminderDays)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != 3 { // default fallback for KeyReminderDays
			t.Errorf("expected fallback default int 3, got %d", val)
		}
	})
}

func TestSettingsService_Set_Validation(t *testing.T) {
	db := setupTestDB(t)
	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	ctx := context.Background()

	err := svc.Set(ctx, "invalid_non_allowed_key", "value")
	if err == nil {
		t.Fatal("expected error when setting non-allowed key, got nil")
	}
}

func TestSettingsService_Lease(t *testing.T) {
	db := setupTestDB(t)
	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	ctx := context.Background()

	leaseKey := "test_lock"
	owner1 := "worker_1"
	owner2 := "worker_2"

	t.Run("Acquire free lease", func(t *testing.T) {
		expiry := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		acquired, err := svc.TryAcquireLease(ctx, leaseKey, owner1, expiry)
		if err != nil {
			t.Fatalf("unexpected lease error: %v", err)
		}
		if !acquired {
			t.Fatal("expected to acquire free lease")
		}
	})

	t.Run("Acquire busy lease fails", func(t *testing.T) {
		expiry := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		acquired, err := svc.TryAcquireLease(ctx, leaseKey, owner2, expiry)
		if err != nil {
			t.Fatalf("unexpected lease error: %v", err)
		}
		if acquired {
			t.Fatal("expected busy lease acquisition to fail")
		}
	})

	t.Run("Acquire expired lease succeeds", func(t *testing.T) {
		// Set past expiry time
		pastExpiry := time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339)
		_, _ = db.Exec("UPDATE pengaturan SET value = ? WHERE key = ?", pastExpiry, leaseKey+"_until")

		expiry := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		acquired, err := svc.TryAcquireLease(ctx, leaseKey, owner2, expiry)
		if err != nil {
			t.Fatalf("unexpected lease error: %v", err)
		}
		if !acquired {
			t.Fatal("expected to acquire expired lease")
		}
	})

	t.Run("Release lease", func(t *testing.T) {
		err := svc.ReleaseLease(ctx, leaseKey, owner2)
		if err != nil {
			t.Fatalf("unexpected lease release error: %v", err)
		}

		// Now owner1 can acquire it again
		expiry := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		acquired, err := svc.TryAcquireLease(ctx, leaseKey, owner1, expiry)
		if err != nil {
			t.Fatalf("unexpected lease error: %v", err)
		}
		if !acquired {
			t.Fatal("expected to acquire released lease")
		}
	})
}
