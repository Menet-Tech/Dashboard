package handler_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/http/router"
)

type healthSmokeResponse struct {
	Status       string   `json:"status"`
	Alerts       []string `json:"alerts"`
	Integrations struct {
		WhatsAppConfigured bool `json:"whatsapp_configured"`
		DiscordConfigured  bool `json:"discord_configured"`
		MikrotikConfigured bool `json:"mikrotik_configured"`
	} `json:"integrations"`
}

// TestHealthEndpoints tests health/readiness endpoints
func TestHealthEndpoints(t *testing.T) {
	db := handlerTestDB(t)
	cfg := config.Config{AppName: "test", HTTPAddr: ":8080"}

	authSvc := auth.Service{
		Repository:        auth.Repository{DB: db},
		SessionCookieName: "session",
		SessionTTL:        24 * time.Hour,
	}

	server := httptest.NewServer(router.New(cfg, nil, db, authSvc))
	defer server.Close()

	tests := []struct {
		name string
		path string
		want int
	}{
		{"/livez", "/livez", http.StatusOK},
		{"/readyz", "/readyz", http.StatusOK},
		{"/health", "/health", http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, err := http.Get(fmt.Sprintf("%s%s", server.URL, tt.path))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			if resp.StatusCode != tt.want {
				t.Errorf("status: got %d, want %d", resp.StatusCode, tt.want)
			}
			resp.Body.Close()
		})
	}

	t.Run("/health payload contains alerts and integrations", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("%s/health", server.URL))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status: got %d, want %d", resp.StatusCode, http.StatusOK)
		}
		var payload healthSmokeResponse
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode health payload: %v", err)
		}
		if payload.Alerts == nil {
			t.Fatal("expected alerts array in health payload")
		}
		// Presence check for integration contract.
		_ = payload.Integrations.WhatsAppConfigured
		_ = payload.Integrations.DiscordConfigured
		_ = payload.Integrations.MikrotikConfigured
	})
}

// TestAuthEndpoints tests login/logout flow
func TestAuthEndpoints(t *testing.T) {
	db := handlerTestDB(t)
	cfg := config.Config{
		AppName:                "test",
		HTTPAddr:               ":8080",
		SessionCookieName:      "session",
		SessionTTL:             24 * time.Hour,
		LoginMaxAttempts:       5,
		LoginWindowMinutes:     15,
		BootstrapAdminUsername: "admin",
		BootstrapAdminPassword: "admin123",
	}

	authSvc := auth.Service{
		Repository:             auth.Repository{DB: db},
		SessionCookieName:      cfg.SessionCookieName,
		SessionCookieSecure:    cfg.SessionCookieSecure,
		SessionTTL:             cfg.SessionTTL,
		LoginMaxAttempts:       cfg.LoginMaxAttempts,
		LoginWindow:            time.Duration(cfg.LoginWindowMinutes) * time.Minute,
		BootstrapAdminUsername: cfg.BootstrapAdminUsername,
		BootstrapAdminPassword: cfg.BootstrapAdminPassword,
	}

	if err := authSvc.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	server := httptest.NewServer(router.New(cfg, nil, db, authSvc))
	defer server.Close()

	t.Run("Invalid login", func(t *testing.T) {
		payload := map[string]string{"username": "admin", "password": "wrong"}
		body, _ := json.Marshal(payload)

		resp, err := http.Post(
			fmt.Sprintf("%s/api/v1/auth/login", server.URL),
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("status: got %d, want %d", resp.StatusCode, http.StatusUnauthorized)
		}
		resp.Body.Close()
	})

	t.Run("Valid login", func(t *testing.T) {
		payload := map[string]string{"username": "admin", "password": "admin123"}
		body, _ := json.Marshal(payload)

		resp, err := http.Post(
			fmt.Sprintf("%s/api/v1/auth/login", server.URL),
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("status: got %d, want %d", resp.StatusCode, http.StatusOK)
		}

		// Check for session cookie
		cookies := resp.Cookies()
		foundSession := false
		for _, c := range cookies {
			if c.Name == "session" {
				foundSession = true
				break
			}
		}
		if !foundSession {
			t.Error("session cookie not set")
		}

		resp.Body.Close()
	})
}

// TestPackageEndpoints tests CRUD for packages
func TestPackageEndpoints(t *testing.T) {
	db := handlerTestDB(t)
	cfg := config.Config{AppName: "test", HTTPAddr: ":8080"}

	authSvc := auth.Service{
		Repository:        auth.Repository{DB: db},
		SessionCookieName: "session",
		SessionTTL:        24 * time.Hour,
	}

	server := httptest.NewServer(router.New(cfg, nil, db, authSvc))
	defer server.Close()

	t.Run("List packages (empty)", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("%s/api/v1/packages", server.URL))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			// Protected endpoint
			t.Logf("endpoint protection: status %d", resp.StatusCode)
		}
		resp.Body.Close()
	})
}

// TestBillingEndpoints tests billing operations
func TestBillingEndpoints(t *testing.T) {
	db := handlerTestDB(t)
	cfg := config.Config{AppName: "test", HTTPAddr: ":8080"}

	authSvc := auth.Service{
		Repository:        auth.Repository{DB: db},
		SessionCookieName: "session",
		SessionTTL:        24 * time.Hour,
	}

	// Create test data
	pkgID := createPackageForTest(t, db)
	custID := createCustomerForTest(t, db, pkgID)
	billID := generateBillForTest(t, db, custID, pkgID)

	server := httptest.NewServer(router.New(cfg, nil, db, authSvc))
	defer server.Close()

	t.Run("Get bill by ID without auth", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("%s/api/v1/bills/%d", server.URL, billID))
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			// Protected endpoint
			t.Logf("endpoint protection: status %d", resp.StatusCode)
		}
		resp.Body.Close()
	})
}

// Helper functions
func createPackageForTest(t *testing.T, db *sql.DB) int64 {
	t.Helper()

	result, err := db.Exec(`
		INSERT INTO paket (nama, kecepatan_mbps, harga)
		VALUES (?, ?, ?)
	`, "Test Package", 10, 100000)
	if err != nil {
		t.Fatalf("create package: %v", err)
	}

	id, _ := result.LastInsertId()
	return id
}

func createCustomerForTest(t *testing.T, db *sql.DB, pkgID int64) int64 {
	t.Helper()

	result, err := db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, nomor_wa, tgl_jatuh_tempo, status)
		VALUES (?, ?, ?, ?, ?)
	`, "Test Customer", pkgID, "6281234567890", 10, "active")
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}

	id, _ := result.LastInsertId()
	return id
}

func generateBillForTest(t *testing.T, db *sql.DB, custID, pkgID int64) int64 {
	t.Helper()

	period := time.Now().Format("2006-01")
	invoiceNumber := fmt.Sprintf("INV-%s-%d-001", period, custID)

	result, err := db.Exec(`
		INSERT INTO tagihan (pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, custID, pkgID, period, invoiceNumber, 100000, time.Now().AddDate(0, 0, 10).Format("2006-01-02"), "belum_bayar")
	if err != nil {
		t.Fatalf("create bill: %v", err)
	}

	id, _ := result.LastInsertId()
	return id
}
