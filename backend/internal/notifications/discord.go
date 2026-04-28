package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"menettech/dashboard/backend/internal/settings"
)

type DiscordSender interface {
	SendAlert(ctx context.Context, message string) error
	IsEventEnabled(ctx context.Context, eventKey string) bool
}

type DiscordService struct {
	Settings   settings.Service
	HTTPClient *http.Client
}

func NewDiscordService(settings settings.Service) *DiscordService {
	return &DiscordService{
		Settings: settings,
		HTTPClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

type discordPayload struct {
	Content string `json:"content"`
}

func (s *DiscordService) SendAlert(ctx context.Context, message string) error {
	webhookURL, err := s.Settings.GetString(ctx, "discord_webhook_url")
	if err != nil || webhookURL == "" {
		return nil // Webhook not configured, skip silently
	}

	payload := discordPayload{
		Content: message,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal discord payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("create discord request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("send discord request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord responded with status: %d", resp.StatusCode)
	}

	return nil
}

func (s *DiscordService) IsEventEnabled(ctx context.Context, eventKey string) bool {
	val, err := s.Settings.GetString(ctx, eventKey)
	if err != nil {
		return false
	}
	return val == "1" || val == "true"
}
