package handler

import (
	"context"
	"net/http"
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
	waAPIKey, _ := h.Settings.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := h.Settings.GetString(ctx, settings.KeyWAAccountID)

	waStatus := "not_configured"
	if strings.TrimSpace(waGatewayURL) != "" && strings.TrimSpace(waAPIKey) != "" {
		waStatus = "disconnected"

		client := h.HTTPClient
		if client == nil {
			client = &http.Client{Timeout: 5 * time.Second}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, waGatewayURL, nil)
		if err == nil {
			req.Header.Set("X-API-Key", waAPIKey)
			if strings.TrimSpace(waAccountID) != "" {
				req.Header.Set("X-Account-Id", waAccountID)
			}
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 400 {
					waStatus = "connected"
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
