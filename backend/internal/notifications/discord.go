package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/bwmarrin/discordgo"
	"menettech/dashboard/backend/internal/settings"
)

type EmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type EmbedFooter struct {
	Text string `json:"text"`
}

type DiscordEmbed struct {
	Title       string       `json:"title,omitempty"`
	Description string       `json:"description,omitempty"`
	Color       int          `json:"color,omitempty"`
	Fields      []EmbedField `json:"fields,omitempty"`
	Timestamp   string       `json:"timestamp,omitempty"`
	Footer      *EmbedFooter `json:"footer,omitempty"`
}

type DiscordSender interface {
	SendAlert(ctx context.Context, message string) error
	SendEmbed(ctx context.Context, embed DiscordEmbed) error
	SendFile(ctx context.Context, message string, filename string, fileData []byte) error
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

type discordEmbedPayload struct {
	Embeds []DiscordEmbed `json:"embeds"`
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

func (s *DiscordService) SendEmbed(ctx context.Context, embed DiscordEmbed) error {
	webhookURL, err := s.Settings.GetString(ctx, "discord_webhook_url")
	if err != nil || webhookURL == "" {
		return nil // Webhook not configured, skip silently
	}

	if embed.Timestamp == "" {
		embed.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	if embed.Footer == nil {
		embed.Footer = &EmbedFooter{
			Text: "Menet-Tech Dashboard",
		}
	}

	payload := discordEmbedPayload{
		Embeds: []DiscordEmbed{embed},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal discord embed payload: %w", err)
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

func (s *DiscordService) SendFile(ctx context.Context, message string, filename string, fileData []byte) error {
	// Try sending via Discord Bot if backup_discord_channel_id and discord_bot_token are configured
	channelID, _ := s.Settings.GetString(ctx, "backup_discord_channel_id")
	botToken, _ := s.Settings.GetString(ctx, "discord_bot_token")
	if channelID != "" && botToken != "" {
		dg, err := discordgo.New("Bot " + botToken)
		if err == nil {
			dg.Client = s.HTTPClient
			fileReader := bytes.NewReader(fileData)
			_, err = dg.ChannelFileSendWithMessage(channelID, message, filename, fileReader)
			if err == nil {
				return nil
			}
			// If bot fails, fall back to webhook
		}
	}

	webhookURL, err := s.Settings.GetString(ctx, "discord_webhook_url")
	if err != nil || webhookURL == "" {
		return nil // Webhook not configured, skip silently
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add payload_json for the message content
	if message != "" {
		payload := discordPayload{Content: message}
		payloadBytes, _ := json.Marshal(payload)
		err = writer.WriteField("payload_json", string(payloadBytes))
		if err != nil {
			return fmt.Errorf("write payload_json: %w", err)
		}
	}

	// Add the file
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return fmt.Errorf("create form file: %w", err)
	}
	_, err = part.Write(fileData)
	if err != nil {
		return fmt.Errorf("write file data: %w", err)
	}

	err = writer.Close()
	if err != nil {
		return fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, body)
	if err != nil {
		return fmt.Errorf("create discord file request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("send discord file request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord file upload responded with status: %d", resp.StatusCode)
	}

	return nil
}
