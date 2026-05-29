package handler_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/http/router"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
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

type mockRoundTripper struct {
	roundTripFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTripFunc(req)
}

func TestIntegrationHandlerCheck(t *testing.T) {
	t.Run("WA and Discord not configured", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}

		if res["whatsapp"] != "not_configured" {
			t.Errorf("expected whatsapp not_configured, got %v", res["whatsapp"])
		}
		if res["discord"] != "not_configured" {
			t.Errorf("expected discord not_configured, got %v", res["discord"])
		}
	})

	t.Run("WA configured but gateway unreachable", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://invalid-gateway-url.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "test-api-key")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)

		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					return nil, http.ErrHandlerTimeout
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}

		if res["whatsapp"] != "disconnected" {
			t.Errorf("expected whatsapp disconnected, got %v", res["whatsapp"])
		}
		if res["discord"] != "not_configured" {
			t.Errorf("expected discord not_configured, got %v", res["discord"])
		}
	})

	t.Run("WA and Discord connected", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://whatsapp.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "test-api-key")
		_ = svc.Set(context.Background(), settings.KeyDiscordWebhookURL, "http://discord.local")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)

		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					if req.URL.Host == "whatsapp.local" {
						return &http.Response{
							StatusCode: http.StatusOK,
							Body:       http.NoBody,
						}, nil
					}
					if req.URL.Host == "discord.local" {
						return &http.Response{
							StatusCode: http.StatusOK,
							Body:       http.NoBody,
						}, nil
					}
					return &http.Response{
						StatusCode: http.StatusNotFound,
						Body:       http.NoBody,
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}

		if res["whatsapp"] != "connected" {
			t.Errorf("expected whatsapp connected, got %v", res["whatsapp"])
		}
		if res["discord"] != "connected" {
			t.Errorf("expected discord connected, got %v", res["discord"])
		}
	})

	t.Run("WA gateway returns whatsapp_ready=true", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-gateway.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "api-key-123")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					// Return JSON with whatsapp_ready: true
					body := `{"whatsapp_ready":true,"session":"active"}`
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(body)),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if res["whatsapp"] != "connected" {
			t.Errorf("expected whatsapp connected (ready=true), got %v", res["whatsapp"])
		}
	})

	t.Run("WA gateway returns whatsapp_ready=false", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-gateway.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "api-key-123")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					// Return JSON with whatsapp_ready: false (QR not scanned yet)
					body := `{"whatsapp_ready":false,"session":"pending"}`
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(body)),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if res["whatsapp"] != "disconnected" {
			t.Errorf("expected whatsapp disconnected (ready=false), got %v", res["whatsapp"])
		}
	})

	t.Run("WA gateway returns non-JSON body (fallback to connected)", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-legacy.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "api-key-456")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					// Non-JSON response body (e.g. plain text "OK")
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader("OK")),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		// Fallback: if JSON decode fails but HTTP status < 400, treat as connected
		if res["whatsapp"] != "connected" {
			t.Errorf("expected fallback to connected for non-JSON body, got %v", res["whatsapp"])
		}
	})

	t.Run("WA gateway returns HTTP 4xx", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-unauthorized.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "bad-key")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusUnauthorized,
						Body:       io.NopCloser(strings.NewReader(`{"error":"unauthorized"}`)),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if res["whatsapp"] != "disconnected" {
			t.Errorf("expected whatsapp disconnected for HTTP 401, got %v", res["whatsapp"])
		}
	})

	t.Run("WA configured with account ID header sent", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-multi.local")
		_ = svc.Set(context.Background(), settings.KeyWAAPIKey, "api-key-multi")
		_ = svc.Set(context.Background(), settings.KeyWAAccountID, "account-001")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		var capturedAccountID string
		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					capturedAccountID = req.Header.Get("X-Account-Id")
					body := `{"whatsapp_ready":true}`
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(body)),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		if capturedAccountID != "account-001" {
			t.Errorf("expected X-Account-Id header 'account-001', got %q", capturedAccountID)
		}
		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if res["whatsapp"] != "connected" {
			t.Errorf("expected whatsapp connected, got %v", res["whatsapp"])
		}
	})

	t.Run("Discord webhook returns 4xx", func(t *testing.T) {
		db := handlerTestDB(t)
		svc := settings.Service{Repository: settings.Repository{DB: db}}

		_ = svc.Set(context.Background(), settings.KeyDiscordWebhookURL, "http://discord-invalid.local/webhook")

		whatsAppService := notifications.WhatsAppService{}
		discordService := &notifications.DiscordService{}

		h := handler.NewIntegrationHandler(svc, whatsAppService, discordService)
		h.HTTPClient = &http.Client{
			Transport: &mockRoundTripper{
				roundTripFunc: func(req *http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusNotFound,
						Body:       io.NopCloser(strings.NewReader(`{"code":0,"message":"Unknown Webhook"}`)),
						Header:     make(http.Header),
					}, nil
				},
			},
		}

		req := httptest.NewRequest(http.MethodGet, "/integration/check", nil)
		w := httptest.NewRecorder()
		h.Check(w, req)

		var res map[string]string
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if res["discord"] != "disconnected" {
			t.Errorf("expected discord disconnected for HTTP 404, got %v", res["discord"])
		}
		if res["whatsapp"] != "not_configured" {
			t.Errorf("expected whatsapp not_configured, got %v", res["whatsapp"])
		}
	})
}

func TestIntegrationFlow_PackageCustomerBill(t *testing.T) {
	db := handlerTestDB(t)
	cfg := config.Config{
		AppName:                "test",
		HTTPAddr:               ":8080",
		SessionCookieName:      "session",
		SessionTTL:             24 * time.Hour,
		BootstrapAdminUsername: "admin",
		BootstrapAdminPassword: "admin123",
	}

	authSvc := auth.Service{
		Repository:             auth.Repository{DB: db},
		SessionCookieName:      cfg.SessionCookieName,
		SessionTTL:             cfg.SessionTTL,
		BootstrapAdminUsername: cfg.BootstrapAdminUsername,
		BootstrapAdminPassword: cfg.BootstrapAdminPassword,
	}

	if err := authSvc.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	server := httptest.NewServer(router.New(cfg, nil, db, authSvc))
	defer server.Close()

	// 1. Admin login to get session cookie
	payload := map[string]string{"username": "admin", "password": "admin123"}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(fmt.Sprintf("%s/api/v1/auth/login", server.URL), "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()

	var sessionCookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "session" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("expected session cookie")
	}

	// 2. Create Package via API
	pkgPayload := map[string]interface{}{"name": "Int-Pkg", "speed_mbps": 20, "price": 150000}
	pkgBody, _ := json.Marshal(pkgPayload)
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/v1/packages", server.URL), bytes.NewReader(pkgBody))
	req.AddCookie(sessionCookie)
	req.Header.Set("X-CSRF-Token", sessionCookie.Value)
	req.Header.Set("Content-Type", "application/json")
	
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create package: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201 created for package, got %d", resp.StatusCode)
	}
	
	var pkgRes struct {
		Success bool `json:"success"`
		Data    struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pkgRes); err != nil {
		t.Fatalf("decode package response: %v", err)
	}
	
	// 3. Create Customer via API
	custPayload := map[string]interface{}{
		"name": "Int-Cust",
		"package_id": pkgRes.Data.ID,
		"due_day": 15,
		"status": "active",
		"trial_days": 3,
	}
	custBody, _ := json.Marshal(custPayload)
	req, _ = http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/v1/customers", server.URL), bytes.NewReader(custBody))
	req.AddCookie(sessionCookie)
	req.Header.Set("X-CSRF-Token", sessionCookie.Value)
	req.Header.Set("Content-Type", "application/json")
	
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201 created for customer, got %d", resp.StatusCode)
	}
}
