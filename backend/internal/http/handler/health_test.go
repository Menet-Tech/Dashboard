package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/settings"
)

func TestHealthHandler(t *testing.T) {
	db := handlerTestDB(t)
	svc := settings.Service{Repository: settings.Repository{DB: db}}
	h := handler.NewHealthHandler(config.Config{AppName: "test"}, nil, db, svc)

	t.Run("Worker unknown when no heartbeat", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		h.Show(w, req)

		var res map[string]any
		json.NewDecoder(w.Body).Decode(&res)

		services := res["services"].(map[string]any)
		if services["worker"] != "unknown" {
			t.Errorf("expected worker unknown, got %v", services["worker"])
		}
		if services["backup"] != "idle" {
			t.Errorf("expected backup idle by default, got %v", services["backup"])
		}
		database := res["database"].(map[string]any)
		quickCheck := database["quick_check"].(map[string]any)
		if quickCheck["status"] != "ok" {
			t.Errorf("expected quick check ok, got %v", quickCheck["status"])
		}
		integrations := res["integrations"].(map[string]any)
		if integrations["mikrotik_configured"] != false {
			t.Errorf("expected mikrotik_configured false by default, got %v", integrations["mikrotik_configured"])
		}
	})

	t.Run("Worker ok when heartbeat fresh", func(t *testing.T) {
		_ = svc.Set(t.Context(), "worker_last_heartbeat", time.Now().UTC().Format(time.RFC3339))
		_ = svc.Set(t.Context(), settings.KeyBackupAutoEnabled, "1")
		_ = svc.Set(t.Context(), "worker_last_backup_date", time.Now().UTC().Format("2006-01-02"))
		_ = svc.Set(t.Context(), settings.KeyBillingAutoEnabled, "1")
		_ = svc.Set(t.Context(), settings.KeyBillingGenerateDay, "1")
		_ = svc.Set(t.Context(), settings.KeyBillingGenerateTime, "00:05")
		_ = svc.Set(t.Context(), "worker_billing_next_run", time.Now().UTC().Add(time.Hour).Format(time.RFC3339))

		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		h.Show(w, req)

		var res map[string]any
		json.NewDecoder(w.Body).Decode(&res)

		services := res["services"].(map[string]any)
		if services["worker"] != "ok" {
			t.Errorf("expected worker ok, got %v", services["worker"])
		}
		if services["backup"] != "ok" {
			t.Errorf("expected backup ok, got %v", services["backup"])
		}

		scheduler := res["scheduler"].(map[string]any)
		if scheduler["billing_auto_enabled"] != true {
			t.Errorf("expected billing automation enabled, got %v", scheduler["billing_auto_enabled"])
		}
	})

	t.Run("Worker error when heartbeat delayed", func(t *testing.T) {
		_ = svc.Set(t.Context(), "worker_last_heartbeat", time.Now().Add(-5*time.Minute).UTC().Format(time.RFC3339))

		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		h.Show(w, req)

		var res map[string]any
		json.NewDecoder(w.Body).Decode(&res)

		services := res["services"].(map[string]any)
		if services["worker"] != "error" {
			t.Errorf("expected worker error, got %v", services["worker"])
		}
	})

	t.Run("Backup disabled when auto backup is turned off", func(t *testing.T) {
		_ = svc.Set(t.Context(), settings.KeyBackupAutoEnabled, "0")

		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		h.Show(w, req)

		var res map[string]any
		json.NewDecoder(w.Body).Decode(&res)

		services := res["services"].(map[string]any)
		if services["backup"] != "disabled" {
			t.Errorf("expected backup disabled, got %v", services["backup"])
		}
	})

	t.Run("MikroTik configured when host user and pass are set", func(t *testing.T) {
		_ = svc.Set(t.Context(), settings.KeyMikrotikHost, "10.10.10.1")
		_ = svc.Set(t.Context(), settings.KeyMikrotikUser, "admin")
		_ = svc.Set(t.Context(), settings.KeyMikrotikPass, "secret")

		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		h.Show(w, req)

		var res map[string]any
		json.NewDecoder(w.Body).Decode(&res)

		integrations := res["integrations"].(map[string]any)
		if integrations["mikrotik_configured"] != true {
			t.Errorf("expected mikrotik_configured true, got %v", integrations["mikrotik_configured"])
		}
	})
}

func TestHealthHandlerBackupUsesLastBackupAt(t *testing.T) {
	db := handlerTestDB(t)
	svc := settings.Service{Repository: settings.Repository{DB: db}}
	h := handler.NewHealthHandler(config.Config{AppName: "test"}, nil, db, svc)

	_ = svc.Set(t.Context(), settings.KeyBackupAutoEnabled, "1")
	_ = svc.Set(t.Context(), "worker_last_backup_at", time.Now().UTC().Format(time.RFC3339))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.Show(w, req)

	var res map[string]any
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode health response: %v", err)
	}

	services := res["services"].(map[string]any)
	if services["backup"] != "ok" {
		t.Errorf("expected backup ok from worker_last_backup_at, got %v", services["backup"])
	}
	backup := res["backup"].(map[string]any)
	if backup["last_run_at"] == "" {
		t.Fatal("expected backup last_run_at to be exposed")
	}
}

func TestHealthHandlerWhatsAppConfiguredUsesSettingsURL(t *testing.T) {
	t.Setenv("WA_GATEWAY_URL", "")

	db := handlerTestDB(t)
	svc := settings.Service{Repository: settings.Repository{DB: db}}
	h := handler.NewHealthHandler(config.Config{AppName: "test"}, nil, db, svc)

	_ = svc.Set(t.Context(), settings.KeyWAGatewayURL, "http://gateway.internal:3001")
	_ = svc.Set(t.Context(), settings.KeyWAAPIKey, "secret")

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.Show(w, req)

	var res map[string]any
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode health response: %v", err)
	}

	integrations := res["integrations"].(map[string]any)
	if integrations["whatsapp_configured"] != true {
		t.Errorf("expected whatsapp_configured true from dashboard settings, got %v", integrations["whatsapp_configured"])
	}
}

func TestHealthHandlerWhatsAppIgnoresEnvWithoutAPIKeySetting(t *testing.T) {
	t.Setenv("WA_GATEWAY_URL", "http://env-only.invalid")
	_ = os.Unsetenv("WA_API_KEY")

	db := handlerTestDB(t)
	svc := settings.Service{Repository: settings.Repository{DB: db}}
	h := handler.NewHealthHandler(config.Config{AppName: "test"}, nil, db, svc)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.Show(w, req)

	var res map[string]any
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode health response: %v", err)
	}

	integrations := res["integrations"].(map[string]any)
	if integrations["whatsapp_configured"] != false {
		t.Errorf("expected whatsapp_configured false without API key setting, got %v", integrations["whatsapp_configured"])
	}
}
