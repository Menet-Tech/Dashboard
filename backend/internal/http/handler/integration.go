package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/packages"
	"menettech/dashboard/backend/internal/settings"
)

type IntegrationHandler struct {
	Settings   settings.Service
	WhatsApp   notifications.WhatsAppService
	Discord    notifications.DiscordSender
	HTTPClient *http.Client
	Customers  customers.Service
	Packages   packages.Service
}

func NewIntegrationHandler(settingsService settings.Service, whatsAppService notifications.WhatsAppService, discordSender notifications.DiscordSender) IntegrationHandler {
	return IntegrationHandler{
		Settings:   settingsService,
		WhatsApp:   whatsAppService,
		Discord:    discordSender,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (h IntegrationHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 1. Check WhatsApp
	waGatewayURL, _ := h.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	trimmedWAGatewayURL := strings.TrimSpace(waGatewayURL)
	if envValue := strings.TrimSpace(os.Getenv("WA_GATEWAY_URL")); envValue != "" && (trimmedWAGatewayURL == "" || trimmedWAGatewayURL == "http://localhost:3001") {
		waGatewayURL = envValue
	}
	if strings.TrimSpace(waGatewayURL) == "" {
		waGatewayURL = "http://localhost:3001"
	}
	waAPIKey, _ := h.Settings.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := h.Settings.GetString(ctx, settings.KeyWAAccountID)
	trimmedWAAccountID := strings.TrimSpace(waAccountID)
	if envValue := strings.TrimSpace(os.Getenv("WA_ACCOUNT_ID")); envValue != "" && (trimmedWAAccountID == "" || trimmedWAAccountID == "default") {
		waAccountID = envValue
	}
	if strings.TrimSpace(waAccountID) == "" {
		waAccountID = "default"
	}

	waStatus := "not_configured"
	if strings.TrimSpace(waGatewayURL) != "" && strings.TrimSpace(waAPIKey) != "" {
		waStatus = "disconnected"

		client := h.HTTPClient
		if client == nil {
			client = &http.Client{Timeout: 5 * time.Second}
		}

		statusURL := fmt.Sprintf("%s/api/v1/status", strings.TrimRight(waGatewayURL, "/"))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
		if err == nil {
			req.Header.Set("X-API-Key", waAPIKey)
			if strings.TrimSpace(waAccountID) != "" {
				req.Header.Set("X-Account-Id", waAccountID)
			}
			resp, err := client.Do(req)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode < 400 {
					// Fallback to connected if status is OK, but try to parse JSON
					waStatus = "connected"
					var result map[string]any
					if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
						if ready, ok := result["whatsapp_ready"].(bool); ok {
							if !ready {
								waStatus = "disconnected"
							}
						}
					}
				}
			}
		}
	}

	// 2. Check Discord
	discordWebhookURL, _ := h.Settings.GetString(ctx, settings.KeyDiscordWebhookURL)

	discordStatus := "not_configured"
	if strings.TrimSpace(discordWebhookURL) != "" {
		discordStatus = "disconnected"

		client := h.HTTPClient
		if client == nil {
			client = &http.Client{Timeout: 5 * time.Second}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordWebhookURL, nil)
		if err == nil {
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 400 {
					discordStatus = "connected"
				}
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"whatsapp": waStatus,
		"discord":  discordStatus,
	})
}

// mikrotikPreviewItem is one PPPoE secret from MikroTik returned in sync preview.
type mikrotikPreviewItem struct {
	Name     string `json:"name"`
	Password string `json:"password"`
	Profile  string `json:"profile"`
	Disabled bool   `json:"disabled"`
	Exists   bool   `json:"exists"` // already in dashboard?
}

// SyncPreview connects to MikroTik, lists all PPPoE secrets, and marks which ones
// already exist in the dashboard database (matched by user_pppoe).
func (h IntegrationHandler) SyncPreview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	host, _ := h.Settings.GetString(ctx, settings.KeyMikrotikHost)
	user, _ := h.Settings.GetString(ctx, settings.KeyMikrotikUser)
	pass, _ := h.Settings.GetString(ctx, settings.KeyMikrotikPass)

	if strings.TrimSpace(host) == "" || strings.TrimSpace(user) == "" || strings.TrimSpace(pass) == "" {
		WriteError(w, http.StatusBadRequest, "konfigurasi MikroTik belum lengkap — isi host, user, dan password terlebih dahulu")
		return
	}

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(ctx); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("gagal terhubung ke MikroTik: %v", err))
		return
	}
	defer client.Close()

	secrets, err := client.ListSecrets(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal membaca PPPoE secrets: %v", err))
		return
	}

	// Build a set of existing user_pppoe values in the dashboard
	existingCustomers, err := h.Customers.List(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "gagal membaca daftar pelanggan")
		return
	}
	existingSet := make(map[string]bool, len(existingCustomers))
	for _, c := range existingCustomers {
		if c.UserPPPoE != "" {
			existingSet[strings.ToLower(strings.TrimSpace(c.UserPPPoE))] = true
		}
	}

	items := make([]mikrotikPreviewItem, 0, len(secrets))
	for _, s := range secrets {
		items = append(items, mikrotikPreviewItem{
			Name:     s.Name,
			Password: s.Password,
			Profile:  s.Profile,
			Disabled: s.Disabled,
			Exists:   existingSet[strings.ToLower(s.Name)],
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"secrets": items,
		"total":   len(items),
	})
}

// syncImportPayload is the request body for SyncImport.
type syncImportPayload struct {
	// Names is the list of PPPoE username to import from the last preview.
	Names []string `json:"names"`
	// DefaultPackageID is the package_id to assign when profile cannot be matched.
	DefaultPackageID int64 `json:"default_package_id"`
	// DefaultDueDay is the tgl_jatuh_tempo to assign (1-31).
	DefaultDueDay int `json:"default_due_day"`
}

// SyncImport bulk-creates customers from MikroTik PPPoE secrets.
// It fetches the named secrets from RouterOS, resolves their profile to a package_id,
// and inserts them as new active customers. Already-existing users are skipped.
func (h IntegrationHandler) SyncImport(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var payload syncImportPayload
	if err := decodeJSON(r, &payload); err != nil || len(payload.Names) == 0 {
		WriteError(w, http.StatusBadRequest, "payload tidak valid atau names kosong")
		return
	}

	dueDay := payload.DefaultDueDay
	if dueDay < 1 || dueDay > 31 {
		dueDay = 1
	}

	host, _ := h.Settings.GetString(ctx, settings.KeyMikrotikHost)
	user, _ := h.Settings.GetString(ctx, settings.KeyMikrotikUser)
	pass, _ := h.Settings.GetString(ctx, settings.KeyMikrotikPass)

	if strings.TrimSpace(host) == "" {
		WriteError(w, http.StatusBadRequest, "konfigurasi MikroTik belum lengkap")
		return
	}

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(ctx); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("gagal terhubung ke MikroTik: %v", err))
		return
	}
	defer client.Close()

	secrets, err := client.ListSecrets(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal membaca PPPoE secrets: %v", err))
		return
	}

	// Build a lookup map by name
	secretMap := make(map[string]mikrotik.PPPoESecret, len(secrets))
	for _, s := range secrets {
		secretMap[strings.ToLower(s.Name)] = s
	}

	// Build a lookup of existing dashboard customers
	existingCustomers, err := h.Customers.List(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "gagal membaca daftar pelanggan")
		return
	}
	existingSet := make(map[string]bool, len(existingCustomers))
	for _, c := range existingCustomers {
		if c.UserPPPoE != "" {
			existingSet[strings.ToLower(strings.TrimSpace(c.UserPPPoE))] = true
		}
	}

	// Load all packages to match profile names
	allPackages, err := h.Packages.List(ctx)
	if err != nil {
		allPackages = nil // not fatal, will use default
	}
	packageByProfile := make(map[string]int64, len(allPackages))
	var fallbackPackageID int64 = payload.DefaultPackageID
	for _, p := range allPackages {
		packageByProfile[strings.ToLower(strings.TrimSpace(p.Name))] = p.ID
		if fallbackPackageID == 0 {
			fallbackPackageID = p.ID // use first available as fallback
		}
	}

	if fallbackPackageID == 0 {
		WriteError(w, http.StatusBadRequest, "tidak ada paket yang tersedia — tambahkan minimal satu paket terlebih dahulu")
		return
	}

	type importResult struct {
		Name    string `json:"name"`
		Status  string `json:"status"` // "imported", "skipped", "error"
		Message string `json:"message,omitempty"`
	}

	var results []importResult
	importedCount := 0

	for _, name := range payload.Names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}

		key := strings.ToLower(name)
		if existingSet[key] {
			results = append(results, importResult{Name: name, Status: "skipped", Message: "sudah ada di dashboard"})
			continue
		}

		secret, ok := secretMap[key]
		if !ok {
			results = append(results, importResult{Name: name, Status: "skipped", Message: "tidak ditemukan di MikroTik"})
			continue
		}

		// Resolve package from profile name
		packageID := fallbackPackageID
		if pid, found := packageByProfile[strings.ToLower(secret.Profile)]; found {
			packageID = pid
		}

		status := "active"
		if secret.Disabled {
			status = "inactive"
		}

		newCustomer := customers.Customer{
			Name:          secret.Name,
			PackageID:     packageID,
			UserPPPoE:     secret.Name,
			PasswordPPPoE: secret.Password,
			DueDay:        dueDay,
			Status:        status,
		}

		_, createErr := h.Customers.Create(ctx, newCustomer)
		if createErr != nil {
			results = append(results, importResult{Name: name, Status: "error", Message: createErr.Error()})
			continue
		}

		importedCount++
		results = append(results, importResult{Name: name, Status: "imported"})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"imported": importedCount,
		"results":  results,
	})
}

// TestMikrotik tests the connection to a MikroTik router using the provided credentials.
func (h IntegrationHandler) TestMikrotik(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Host     string `json:"host"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}
	if strings.TrimSpace(payload.Host) == "" || strings.TrimSpace(payload.Username) == "" {
		WriteError(w, http.StatusBadRequest, "host dan username wajib diisi")
		return
	}
	client := mikrotik.NewClient(payload.Host, payload.Username, payload.Password)
	if err := client.TestConnection(r.Context()); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": err.Error()})
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Koneksi ke MikroTik berhasil"})
}

// TestGenieACS tests the connection to the GenieACS API.
func (h IntegrationHandler) TestGenieACS(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}
	if strings.TrimSpace(payload.URL) == "" {
		WriteError(w, http.StatusBadRequest, "URL GenieACS wajib diisi")
		return
	}
	client := acs.NewClient(payload.URL, payload.Username, payload.Password)
	if err := client.TestConnection(r.Context()); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": err.Error()})
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Koneksi ke GenieACS berhasil"})
}

// TestDiscord sends a test alert message to the specified Discord Webhook URL.
func (h IntegrationHandler) TestDiscord(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		WebhookURL string `json:"webhook_url"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}
	if strings.TrimSpace(payload.WebhookURL) == "" {
		WriteError(w, http.StatusBadRequest, "Webhook URL wajib diisi")
		return
	}
	// Simple test message
	testMsg := map[string]string{"content": "🔔 **Test Koneksi**: Integrasi Webhook Discord Menet-Tech Control Panel berhasil terhubung!"}
	bodyBytes, err := json.Marshal(testMsg)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, payload.WebhookURL, bytes.NewReader(bodyBytes))
	if err != nil {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("URL tidak valid: %v", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("Gagal menghubungi Discord: %v", err)})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("Discord merespon dengan status: %d", resp.StatusCode)})
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Koneksi ke Discord Webhook berhasil"})
}

// TestWhatsApp tests connectivity and WhatsApp status via the gateway bridge status endpoint.
func (h IntegrationHandler) TestWhatsApp(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		GatewayURL string `json:"gateway_url"`
		APIKey     string `json:"api_key"`
		AccountID  string `json:"account_id"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}
	if strings.TrimSpace(payload.GatewayURL) == "" || strings.TrimSpace(payload.APIKey) == "" {
		WriteError(w, http.StatusBadRequest, "Gateway URL dan API Key wajib diisi")
		return
	}
	gatewayURL := strings.TrimRight(payload.GatewayURL, "/")
	statusURL := fmt.Sprintf("%s/api/v1/status", gatewayURL)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, statusURL, nil)
	if err != nil {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("URL tidak valid: %v", err))
		return
	}
	req.Header.Set("X-API-Key", payload.APIKey)
	if strings.TrimSpace(payload.AccountID) != "" {
		req.Header.Set("X-Account-Id", payload.AccountID)
	}
	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("Gagal menghubungi WhatsApp Gateway: %v", err)})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("WhatsApp Gateway merespon dengan status: %d", resp.StatusCode)})
		return
	}
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
		if ready, ok := result["whatsapp_ready"].(bool); ok && !ready {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": "Gateway terhubung, namun status WhatsApp tidak aktif/belum scan QR"})
			return
		}
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Koneksi ke WhatsApp Gateway berhasil"})
}
