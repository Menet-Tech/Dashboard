package handler

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
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
	Routers    *mikrotik.RouterService
}

func NewIntegrationHandler(settingsService settings.Service, whatsAppService notifications.WhatsAppService, discordSender notifications.DiscordSender) IntegrationHandler {
	return IntegrationHandler{
		Settings:   settingsService,
		WhatsApp:   whatsAppService,
		Discord:    discordSender,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// resolveActiveMikrotik returns the host, username, and password to use for a
// MikroTik operation. It first checks the old single-router settings keys;
// if those are empty it falls back to the first active router in the DB table.
func (h IntegrationHandler) resolveActiveMikrotik(ctx context.Context) (host, user, pass string, err error) {
	host, _ = h.Settings.GetString(ctx, settings.KeyMikrotikHost)
	user, _ = h.Settings.GetString(ctx, settings.KeyMikrotikUser)
	pass, _ = h.Settings.GetString(ctx, settings.KeyMikrotikPass)

	if strings.TrimSpace(host) != "" && strings.TrimSpace(user) != "" {
		return host, user, pass, nil
	}

	// Fall back to multi-router table
	if h.Routers == nil {
		return "", "", "", fmt.Errorf("konfigurasi MikroTik belum lengkap — isi host, user, dan password terlebih dahulu")
	}
	routers, lerr := h.Routers.ListActive(ctx)
	if lerr != nil || len(routers) == 0 {
		return "", "", "", fmt.Errorf("konfigurasi MikroTik belum lengkap — isi host, user, dan password terlebih dahulu")
	}
	r := routers[0]
	return r.Host, r.Username, r.Password, nil
}

func (h IntegrationHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 1. Check WhatsApp
	waGatewayURL, _ := h.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	waGatewayURL = settings.ResolveWAGatewayURL(waGatewayURL)
	waAPIKey, _ := h.Settings.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := h.Settings.GetString(ctx, settings.KeyWAAccountID)
	trimmedWAAccountID := strings.TrimSpace(waAccountID)
	if envValue := strings.TrimSpace(os.Getenv("WA_ACCOUNT_ID")); envValue != "" && (trimmedWAAccountID == "" || trimmedWAAccountID == "default") {
		waAccountID = envValue
	}
	if strings.TrimSpace(waAccountID) == "" {
		waAccountID = "default"
	}

	// The local default gateway is valid in production systemd installs; API key
	// presence is the real signal that WhatsApp integration is configured.
	waConfigured := strings.TrimSpace(waAPIKey) != ""

	waStatus := "not_configured"
	if waConfigured {
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

	// 3. Check MikroTik RouterOS API
	mikrotikHost, mikrotikUser, mikrotikPass, _ := h.resolveActiveMikrotik(ctx)

	mikrotikStatus := "not_configured"
	if strings.TrimSpace(mikrotikHost) != "" && strings.TrimSpace(mikrotikUser) != "" {
		mikrotikStatus = "disconnected"
		client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
		if err := client.TestConnection(ctx); err == nil {
			mikrotikStatus = "connected"
		}
	}

	// 4. Check GenieACS API
	acsURL, _ := h.Settings.GetString(ctx, settings.KeyACSURL)
	acsUsername, _ := h.Settings.GetString(ctx, settings.KeyACSUsername)
	acsPassword, _ := h.Settings.GetString(ctx, settings.KeyACSPassword)

	// Treat empty or the localhost default as "not configured" — the user must
	// explicitly save a non-default URL in settings for this to show as configured.
	acsURLTrimmed := strings.TrimSpace(acsURL)
	genieACSStatus := "not_configured"
	if acsURLTrimmed != "" && acsURLTrimmed != "http://localhost:7557" {
		genieACSStatus = "disconnected"
		client := acs.NewClient(acsURL, acsUsername, acsPassword)
		if err := client.TestConnection(ctx); err == nil {
			genieACSStatus = "connected"
		}
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"whatsapp": waStatus,
		"discord":  discordStatus,
		"mikrotik": mikrotikStatus,
		"genieacs": genieACSStatus,
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

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
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
	// ActivateTrial specifies whether imported customers should have trial enabled.
	ActivateTrial bool `json:"activate_trial"`
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

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
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
		} else if secret.Profile != "" {
			// Profile exists on MikroTik but not as a Package on the Dashboard! Let's auto-create it.
			mProfiles, mErr := client.ListProfiles(ctx)
			if mErr == nil {
				var matchedProfile *mikrotik.PPPoEProfile
				for _, mp := range mProfiles {
					if strings.EqualFold(mp.Name, secret.Profile) {
						matchedProfile = &mp
						break
					}
				}
				if matchedProfile != nil {
					// Parse speed from rate limit (e.g. 15M/15M -> 15)
					speedVal := 0 // default to 0 (Unlimited/Bypass)
					cleanLimit := strings.TrimSpace(strings.ToUpper(matchedProfile.RateLimit))
					if cleanLimit != "" {
						if idx := strings.Index(cleanLimit, "/"); idx != -1 {
							cleanLimit = cleanLimit[idx+1:]
						}
						var floatSpeed float64
						var unit string
						if _, scanErr := fmt.Sscanf(cleanLimit, "%f%s", &floatSpeed, &unit); scanErr == nil {
							if strings.HasPrefix(unit, "M") {
								speedVal = int(floatSpeed)
							} else if strings.HasPrefix(unit, "K") {
								speedVal = int(floatSpeed / 1000.0)
							} else if strings.HasPrefix(unit, "G") {
								speedVal = int(floatSpeed * 1000.0)
							} else {
								speedVal = int(floatSpeed / 1000000.0)
							}
						}
						if speedVal <= 0 {
							speedVal = 10 // fallback if parsing failed but rate limit was non-empty
						}
					}

					newPkg := packages.Package{
						Name:         matchedProfile.Name,
						SpeedMbps:    speedVal,
						Price:        0, // default, let user set it later
						Description:  fmt.Sprintf("Auto-imported from MikroTik profile %s", matchedProfile.Name),
						IPPool:       matchedProfile.RemoteAddress,
						LocalAddress: matchedProfile.LocalAddress,
					}

					// Skip manipulating MikroTik back
					importCtx := context.WithValue(ctx, "skip_mikrotik_sync", true)
					createdPkg, createPkgErr := h.Packages.Create(importCtx, newPkg)
					if createPkgErr == nil {
						packageID = createdPkg.ID
						packageByProfile[strings.ToLower(matchedProfile.Name)] = createdPkg.ID
						if fallbackPackageID == 0 {
							fallbackPackageID = createdPkg.ID
						}
					}
				}
			}
		}

		// Skip if no package could be resolved at all
		if packageID == 0 {
			results = append(results, importResult{Name: name, Status: "skipped", Message: fmt.Sprintf("tidak ada paket yang cocok untuk profile '%s' — buat paket di Dashboard terlebih dahulu", secret.Profile)})
			continue
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

		importCtx := context.WithValue(ctx, "skip_mikrotik_sync", true)
		if payload.ActivateTrial {
			newCustomer.IsTrial = true
			newCustomer.Status = "trial"
		} else {
			importCtx = context.WithValue(importCtx, "skip_trial_activation", true)
		}

		createdCust, createErr := h.Customers.Create(importCtx, newCustomer)
		if createErr != nil {
			results = append(results, importResult{Name: name, Status: "error", Message: createErr.Error()})
			continue
		}

		if payload.ActivateTrial && createdCust.WhatsApp != "" && h.WhatsApp.Logs.DB != nil {
			go func(c customers.Customer) {
				bgCtx := context.Background()
				_ = h.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
					TriggerKey:  "trial_started",
					PhoneNumber: c.WhatsApp,
					MessageData: map[string]string{
						"nama":                c.Name,
						"hari_limit":          strconv.Itoa(c.TrialDays),
						"tanggal_akhir_trial": formatDateLabel(time.Now().AddDate(0, 0, c.TrialDays).Format("2006-01-02")),
					},
				})
			}(createdCust)
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
	if strings.TrimSpace(payload.GatewayURL) == "" {
		payload.GatewayURL, _ = h.Settings.GetString(r.Context(), settings.KeyWAGatewayURL)
	}
	if strings.TrimSpace(payload.APIKey) == "" {
		payload.APIKey, _ = h.Settings.GetString(r.Context(), settings.KeyWAAPIKey)
	}
	if strings.TrimSpace(payload.GatewayURL) == "" || strings.TrimSpace(payload.APIKey) == "" {
		WriteError(w, http.StatusBadRequest, "Gateway URL dan API Key wajib diisi")
		return
	}
	gatewayURL := strings.TrimRight(settings.ResolveWAGatewayURL(payload.GatewayURL), "/")
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
	authenticated := true
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
		if ready, ok := result["whatsapp_ready"].(bool); ok && !ready {
			authenticated = false
		}
	}
	if !authenticated {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success":       true,
			"authenticated": false,
			"message":       "Gateway terhubung, namun WhatsApp belum aktif/belum scan QR",
		})
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"authenticated": true,
		"message":       "Koneksi ke WhatsApp Gateway berhasil",
	})
}

// TestSMTP tests sending an email with provided SMTP settings.
func (h IntegrationHandler) TestSMTP(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Host       string `json:"host"`
		Port       string `json:"port"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		FromEmail  string `json:"from_email"`
		Encryption string `json:"encryption"`
		ToEmail    string `json:"to_email"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}
	if strings.TrimSpace(payload.Host) == "" || strings.TrimSpace(payload.ToEmail) == "" {
		WriteError(w, http.StatusBadRequest, "Host SMTP dan email penerima wajib diisi")
		return
	}

	portStr := strings.TrimSpace(payload.Port)
	if portStr == "" {
		portStr = "587"
	}

	addr := net.JoinHostPort(payload.Host, portStr)
	var auth smtp.Auth
	if payload.Username != "" {
		auth = smtp.PlainAuth("", payload.Username, payload.Password, payload.Host)
	}

	msg := fmt.Appendf(nil, "To: %s\r\n"+
		"From: %s\r\n"+
		"Subject: Test SMTP Connection\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"MIME-Version: 1.0\r\n"+
		"\r\n"+
		"Koneksi SMTP berhasil dikonfigurasi! Ini adalah email uji dari Menet-Tech Dashboard Control Panel.\r\n",
		payload.ToEmail, payload.FromEmail)

	if strings.ToLower(payload.Encryption) == "ssl" || portStr == "465" {
		tlsconfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         payload.Host,
		}

		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, tlsconfig)
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("tls dial error: %v", err)})
			return
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, payload.Host)
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp new client error: %v", err)})
			return
		}
		defer c.Close()

		if auth != nil {
			if ok, _ := c.Extension("AUTH"); ok {
				if err = c.Auth(auth); err != nil {
					WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp auth error: %v", err)})
					return
				}
			}
		}

		if err = c.Mail(payload.FromEmail); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp mail command error: %v", err)})
			return
		}
		if err = c.Rcpt(payload.ToEmail); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp rcpt command error: %v", err)})
			return
		}

		wr, err := c.Data()
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp data command error: %v", err)})
			return
		}

		if _, err = wr.Write(msg); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("write body error: %v", err)})
			return
		}

		_ = wr.Close()
		_ = c.Quit()
	} else {
		conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("tcp dial error: %v", err)})
			return
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, payload.Host)
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp new client error: %v", err)})
			return
		}
		defer c.Close()

		if strings.ToLower(payload.Encryption) == "tls" || strings.ToLower(payload.Encryption) == "starttls" || portStr == "587" {
			tlsconfig := &tls.Config{
				InsecureSkipVerify: true,
				ServerName:         payload.Host,
			}
			if err = c.StartTLS(tlsconfig); err != nil {
				WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp starttls error: %v", err)})
				return
			}
		}

		if auth != nil {
			if ok, _ := c.Extension("AUTH"); ok {
				if err = c.Auth(auth); err != nil {
					WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp auth error: %v", err)})
					return
				}
			}
		}

		if err = c.Mail(payload.FromEmail); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp mail command error: %v", err)})
			return
		}
		if err = c.Rcpt(payload.ToEmail); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp rcpt command error: %v", err)})
			return
		}

		wr, err := c.Data()
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("smtp data command error: %v", err)})
			return
		}

		if _, err = wr.Write(msg); err != nil {
			WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("write body error: %v", err)})
			return
		}

		_ = wr.Close()
		_ = c.Quit()
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Email uji coba berhasil dikirim"})
}

type packageSyncPreviewItem struct {
	Name        string `json:"name"`
	RateLimit   string `json:"rate_limit"`
	Exists      bool   `json:"exists"`
	ParsedSpeed int    `json:"parsed_speed"`
}

func (h IntegrationHandler) SyncPackagesPreview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	isolirProfile, err := h.Settings.GetString(ctx, settings.KeyMikrotikIsolirProfile)
	if err != nil || strings.TrimSpace(isolirProfile) == "" {
		isolirProfile = "isolir"
	}
	inactiveProfile, err := h.Settings.GetString(ctx, settings.KeyMikrotikInactiveProfile)
	if err != nil || strings.TrimSpace(inactiveProfile) == "" {
		inactiveProfile = "nonaktif"
	}
	isolirProfileLower := strings.ToLower(strings.TrimSpace(isolirProfile))
	inactiveProfileLower := strings.ToLower(strings.TrimSpace(inactiveProfile))

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(ctx); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("gagal terhubung ke MikroTik: %v", err))
		return
	}
	defer client.Close()

	profiles, err := client.ListProfiles(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal membaca PPPoE profiles: %v", err))
		return
	}

	existingPackages, err := h.Packages.List(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "gagal membaca daftar paket")
		return
	}
	existingSet := make(map[string]bool, len(existingPackages))
	for _, p := range existingPackages {
		existingSet[strings.ToLower(strings.TrimSpace(p.Name))] = true
	}

	items := make([]packageSyncPreviewItem, 0, len(profiles))
	for _, p := range profiles {
		nameLower := strings.ToLower(strings.TrimSpace(p.Name))
		if nameLower == "default" || nameLower == "default-encryption" || nameLower == isolirProfileLower || nameLower == inactiveProfileLower {
			continue
		}
		items = append(items, packageSyncPreviewItem{
			Name:        p.Name,
			RateLimit:   p.RateLimit,
			Exists:      existingSet[nameLower],
			ParsedSpeed: parseSpeedMbps(p.RateLimit),
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"profiles": items,
		"total":    len(items),
	})
}

type syncPackagesImportPayload struct {
	Names []string `json:"names"`
}

func (h IntegrationHandler) SyncPackagesImport(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var payload syncPackagesImportPayload
	if err := decodeJSON(r, &payload); err != nil || len(payload.Names) == 0 {
		WriteError(w, http.StatusBadRequest, "payload tidak valid atau names kosong")
		return
	}

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(ctx); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("gagal terhubung ke MikroTik: %v", err))
		return
	}
	defer client.Close()

	profiles, err := client.ListProfiles(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal membaca PPPoE profiles: %v", err))
		return
	}

	profileMap := make(map[string]mikrotik.PPPoEProfile, len(profiles))
	for _, p := range profiles {
		profileMap[strings.ToLower(strings.TrimSpace(p.Name))] = p
	}

	existingPackages, err := h.Packages.List(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "gagal membaca daftar paket")
		return
	}
	existingSet := make(map[string]bool, len(existingPackages))
	for _, p := range existingPackages {
		existingSet[strings.ToLower(strings.TrimSpace(p.Name))] = true
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

		profile, ok := profileMap[key]
		if !ok {
			results = append(results, importResult{Name: name, Status: "skipped", Message: "tidak ditemukan di MikroTik"})
			continue
		}

		speed := parseSpeedMbps(profile.RateLimit)
		price := speed * 15000
		if price < 100000 {
			price = 100000
		}

		newPkg := packages.Package{
			Name:         profile.Name,
			SpeedMbps:    speed,
			RateLimit:    profile.RateLimit, // preserve original MikroTik rate-limit string (may include burst)
			Price:        price,
			Description:  "Sinkronisasi dari profil MikroTik " + profile.Name,
			IPPool:       profile.RemoteAddress,
			LocalAddress: profile.LocalAddress,
		}

		_, createErr := h.Packages.Create(ctx, newPkg)
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

func parseSpeedMbps(rateLimit string) int {
	if rateLimit == "" {
		return 10
	}
	parts := strings.Split(rateLimit, "/")
	target := parts[0]
	if len(parts) > 1 {
		target = parts[1]
	}
	target = strings.TrimSpace(strings.ToUpper(target))

	var multiplier float64 = 1.0
	numStr := ""
	for _, char := range target {
		if (char >= '0' && char <= '9') || char == '.' {
			numStr += string(char)
		} else if char == 'M' {
			multiplier = 1.0
			break
		} else if char == 'K' {
			multiplier = 0.001
			break
		} else if char == 'G' {
			multiplier = 1000.0
			break
		}
	}
	var val float64
	_, _ = fmt.Sscanf(numStr, "%f", &val)
	speed := int(val * multiplier)
	if speed <= 0 {
		return 10
	}
	return speed
}

func (h IntegrationHandler) CheckProfiles(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	isolirProfile, err := h.Settings.GetString(ctx, settings.KeyMikrotikIsolirProfile)
	if err != nil || strings.TrimSpace(isolirProfile) == "" {
		isolirProfile = "isolir"
	}
	inactiveProfile, err := h.Settings.GetString(ctx, settings.KeyMikrotikInactiveProfile)
	if err != nil || strings.TrimSpace(inactiveProfile) == "" {
		inactiveProfile = "nonaktif"
	}

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(ctx); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": "Gagal terhubung ke MikroTik: " + err.Error(),
		})
		return
	}
	defer client.Close()

	profiles, err := client.ListProfiles(ctx)
	if err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": "Gagal mengambil daftar profile MikroTik: " + err.Error(),
		})
		return
	}

	isolirExists := false
	inactiveExists := false
	for _, p := range profiles {
		if strings.EqualFold(p.Name, isolirProfile) {
			isolirExists = true
		}
		if strings.EqualFold(p.Name, inactiveProfile) {
			inactiveExists = true
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":               true,
		"isolir_exists":         isolirExists,
		"inactive_exists":       inactiveExists,
		"isolir_profile_name":   isolirProfile,
		"inactive_profile_name": inactiveProfile,
	})
}

func (h IntegrationHandler) SetupProfiles(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var payload struct {
		IsolirProfileName   string `json:"isolir_profile_name"`
		IsolirLocalAddress  string `json:"isolir_local_address"`
		IsolirRemoteAddress string `json:"isolir_remote_address"`
		IsolirRateLimit     string `json:"isolir_rate_limit"`
		IsolirCreatePool    bool   `json:"isolir_create_pool"`
		IsolirPoolRange     string `json:"isolir_pool_range"`

		InactiveProfileName   string `json:"inactive_profile_name"`
		InactiveLocalAddress  string `json:"inactive_local_address"`
		InactiveRemoteAddress string `json:"inactive_remote_address"`
		InactiveRateLimit     string `json:"inactive_rate_limit"`
		InactiveCreatePool    bool   `json:"inactive_create_pool"`
		InactivePoolRange     string `json:"inactive_pool_range"`
	}

	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	isolirProfile := strings.TrimSpace(payload.IsolirProfileName)
	if isolirProfile == "" {
		isolirProfile = "isolir"
	}
	inactiveProfile := strings.TrimSpace(payload.InactiveProfileName)
	if inactiveProfile == "" {
		inactiveProfile = "nonaktif"
	}

	host, user, pass, err := h.resolveActiveMikrotik(ctx)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// Fetch active routers from mikrotik_routers table
	var routers []mikrotik.Router
	if h.Routers != nil {
		routers, _ = h.Routers.ListActive(ctx)
	}

	// Fallback to legacy single router if list is empty
	if len(routers) == 0 {
		routers = append(routers, mikrotik.Router{
			Name:     "Router Legacy",
			Host:     host,
			Username: user,
			Password: pass,
			IsActive: true,
		})
	}

	var setupErrors []string
	for _, r := range routers {
		client := mikrotik.NewClient(r.Host, r.Username, r.Password)
		if err := client.Connect(ctx); err != nil {
			setupErrors = append(setupErrors, fmt.Sprintf("%s: Gagal terhubung: %v", r.Name, err))
			continue
		}

		// 1. Setup IP Pool if requested
		if payload.IsolirCreatePool && strings.TrimSpace(payload.IsolirRemoteAddress) != "" && strings.TrimSpace(payload.IsolirPoolRange) != "" {
			err = client.AddIPPool(ctx, strings.TrimSpace(payload.IsolirRemoteAddress), strings.TrimSpace(payload.IsolirPoolRange))
			if err != nil {
				setupErrors = append(setupErrors, fmt.Sprintf("%s: Gagal membuat IP Pool %s: %v", r.Name, payload.IsolirRemoteAddress, err))
			}
		}

		if payload.InactiveCreatePool && strings.TrimSpace(payload.InactiveRemoteAddress) != "" && strings.TrimSpace(payload.InactivePoolRange) != "" {
			err = client.AddIPPool(ctx, strings.TrimSpace(payload.InactiveRemoteAddress), strings.TrimSpace(payload.InactivePoolRange))
			if err != nil {
				setupErrors = append(setupErrors, fmt.Sprintf("%s: Gagal membuat IP Pool %s: %v", r.Name, payload.InactiveRemoteAddress, err))
			}
		}

		// 2. Create/Sync isolir profile with rate-limit and IP Pool
		err = client.SyncPPPProfile(ctx, isolirProfile, strings.TrimSpace(payload.IsolirLocalAddress), strings.TrimSpace(payload.IsolirRemoteAddress), strings.TrimSpace(payload.IsolirRateLimit))
		if err != nil {
			setupErrors = append(setupErrors, fmt.Sprintf("%s: Gagal membuat profile %s: %v", r.Name, isolirProfile, err))
		}

		// 3. Create/Sync inactive profile with rate-limit and IP Pool
		err = client.SyncPPPProfile(ctx, inactiveProfile, strings.TrimSpace(payload.InactiveLocalAddress), strings.TrimSpace(payload.InactiveRemoteAddress), strings.TrimSpace(payload.InactiveRateLimit))
		if err != nil {
			setupErrors = append(setupErrors, fmt.Sprintf("%s: Gagal membuat profile %s: %v", r.Name, inactiveProfile, err))
		}

		client.Close()
	}

	if len(setupErrors) > 0 {
		WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false,
			"message": "Beberapa router gagal disetup: " + strings.Join(setupErrors, "; "),
		})
		return
	}

	// Update names of profiles in settings if they differ
	_ = h.Settings.Set(ctx, settings.KeyMikrotikIsolirProfile, isolirProfile)
	_ = h.Settings.Set(ctx, settings.KeyMikrotikInactiveProfile, inactiveProfile)

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Profile PPPoE Isolir dan Suspended berhasil disetup di MikroTik.",
	})
}
