package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

type IntegrationHandler struct {
	Settings   settings.Service
	WhatsApp   notifications.WhatsAppService
	Discord    notifications.DiscordSender
	HTTPClient *http.Client
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
