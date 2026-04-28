package notifications

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
)

type NotificationLogRepository struct {
	DB *sql.DB
}

type WhatsAppService struct {
	Settings   settings.Service
	Templates  templates.Service
	Logs       NotificationLogRepository
	HTTPClient *http.Client
}

type BillMessagePayload struct {
	BillID      int64
	TriggerKey  string
	PhoneNumber string
	MessageData map[string]string
}

func (s WhatsAppService) SendTemplate(ctx context.Context, payload BillMessagePayload) error {
	if strings.TrimSpace(payload.PhoneNumber) == "" {
		return nil
	}

	sent, err := s.Logs.AlreadySent(ctx, payload.BillID, payload.TriggerKey)
	if err != nil {
		return err
	}
	if sent {
		return nil
	}

	tpl, err := s.Templates.FindActiveByTrigger(ctx, payload.TriggerKey)
	if err != nil {
		return err
	}

	url, err := s.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	if err != nil {
		return err
	}
	apiKey, err := s.Settings.GetString(ctx, settings.KeyWAAPIKey)
	if err != nil {
		return err
	}
	accountID, err := s.Settings.GetString(ctx, settings.KeyWAAccountID)
	if err != nil {
		return err
	}

	if strings.TrimSpace(url) == "" || strings.TrimSpace(apiKey) == "" {
		return nil
	}

	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	body, err := json.Marshal(map[string]string{
		"to":   payload.PhoneNumber,
		"text": templates.Render(tpl.Content, payload.MessageData),
	})
	if err != nil {
		return fmt.Errorf("marshal whatsapp payload: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(url, "/")+"/api/v1/messages", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create whatsapp request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-API-Key", apiKey)
	if strings.TrimSpace(accountID) != "" {
		request.Header.Set("X-Account-Id", accountID)
	}

	response, err := client.Do(request)
	if err != nil {
		_ = s.Logs.Record(ctx, payload.BillID, payload.TriggerKey, payload.PhoneNumber, "failed", err.Error())
		return fmt.Errorf("send whatsapp message: %w", err)
	}
	defer response.Body.Close()

	status := "sent"
	message := response.Status
	if response.StatusCode >= 400 {
		status = "failed"
	}

	if err := s.Logs.Record(ctx, payload.BillID, payload.TriggerKey, payload.PhoneNumber, status, message); err != nil {
		return err
	}

	if response.StatusCode >= 400 {
		return fmt.Errorf("whatsapp gateway returned status %d", response.StatusCode)
	}

	return nil
}

func (r NotificationLogRepository) AlreadySent(ctx context.Context, billID int64, triggerKey string) (bool, error) {
	var count int
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM notification_logs
		WHERE bill_id = ?
		  AND trigger_key = ?
		  AND status = 'sent'
	`, billID, triggerKey).Scan(&count); err != nil {
		return false, fmt.Errorf("check notification log: %w", err)
	}
	return count > 0, nil
}

func (r NotificationLogRepository) Record(ctx context.Context, billID int64, triggerKey, sentTo, status, response string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO notification_logs (bill_id, trigger_key, sent_to, status, response_message)
		VALUES (?, ?, ?, ?, ?)
	`, billID, triggerKey, sentTo, status, response)
	if err != nil {
		return fmt.Errorf("record notification log: %w", err)
	}
	return nil
}

type NotificationLog struct {
	ID              int64  `json:"id"`
	BillID          int64  `json:"bill_id"`
	TriggerKey      string `json:"trigger_key"`
	SentTo          string `json:"sent_to"`
	Status          string `json:"status"`
	ResponseMessage string `json:"response_message"`
	CreatedAt       string `json:"created_at"`
}

func (r NotificationLogRepository) FindLogs(ctx context.Context, billID int64) ([]NotificationLog, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, bill_id, trigger_key, COALESCE(sent_to, ''), status, COALESCE(response_message, ''), created_at
		FROM notification_logs
		WHERE bill_id = ?
		ORDER BY id DESC
	`, billID)
	if err != nil {
		return nil, fmt.Errorf("find notification logs: %w", err)
	}
	defer rows.Close()

	items := []NotificationLog{}
	for rows.Next() {
		var item NotificationLog
		if err := rows.Scan(&item.ID, &item.BillID, &item.TriggerKey, &item.SentTo, &item.Status, &item.ResponseMessage, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification log: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
