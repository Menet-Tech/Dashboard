package notifications

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
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
	Force       bool
}

type QueuedMessage struct {
	ID         int64
	AccountID  string
	ToNumber   string
	Body       string
	Status     string
	Attempts   int
	BillID     sql.NullInt64
	TriggerKey sql.NullString
}

func (s WhatsAppService) SendTemplate(ctx context.Context, payload BillMessagePayload) error {
	if strings.TrimSpace(payload.PhoneNumber) == "" {
		return nil
	}

	if !payload.Force {
		sent, err := s.Logs.AlreadySent(ctx, payload.BillID, payload.TriggerKey)
		if err != nil {
			return err
		}
		if sent {
			return nil
		}
	}

	tpl, err := s.Templates.FindActiveByTrigger(ctx, payload.TriggerKey)
	if err != nil {
		return err
	}

	accountID, err := s.accountIDForTrigger(ctx, payload.TriggerKey)
	if err != nil {
		return err
	}
	trimmedAccountID := strings.TrimSpace(accountID)
	if envValue := strings.TrimSpace(os.Getenv("WA_ACCOUNT_ID")); envValue != "" && (trimmedAccountID == "" || trimmedAccountID == "default") {
		accountID = envValue
	}
	if strings.TrimSpace(accountID) == "" {
		accountID = os.Getenv("WA_ACCOUNT_ID")
	}
	if strings.TrimSpace(accountID) == "" {
		accountID = "default"
	}

	var renderedText string

	switch payload.TriggerKey {
	case "lunas":
		var period string
		_ = s.Logs.DB.QueryRowContext(ctx, "SELECT periode FROM tagihan WHERE id = ?", payload.BillID).Scan(&period)
		if period != "" {
			type BillInfo struct {
				Period   string
				Nominal  float64
				CustName string
			}
			var bills []BillInfo
			rows, err := s.Logs.DB.QueryContext(ctx, `
				SELECT t.periode, t.nominal, p.name
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				WHERE p.whatsapp = ? AND t.status = 'lunas' AND t.periode = ?
				ORDER BY t.id ASC
			`, payload.PhoneNumber, period)
			if err == nil {
				for rows.Next() {
					var b BillInfo
					if err := rows.Scan(&b.Period, &b.Nominal, &b.CustName); err == nil {
						bills = append(bills, b)
					}
				}
				rows.Close()
			}

			if len(bills) > 1 {
				primaryName := bills[0].CustName
				var builder strings.Builder
				builder.WriteString(fmt.Sprintf("Pelanggan Yth,\nBapak/Ibu %s,\n\nTerimakasih Atas pembayaran Tagihan anda.\n", primaryName))
				for i, b := range bills {
					priceStr := fmt.Sprintf("Rp. %s", formatThousandSeparator(int(b.Nominal)))
					if i < len(bills)-1 {
						builder.WriteString(fmt.Sprintf("Tagihan periode %s sebesar %s atas nama %s,\n", b.Period, priceStr, b.CustName))
					} else {
						builder.WriteString(fmt.Sprintf("Tagihan periode %s sebesar %s atas nama %s. Sudah Kami Terima.\n", b.Period, priceStr, b.CustName))
					}
				}
				builder.WriteString("\nUntuk Pengaduan kendala dapat menghubungi kami melalui nomor berikut.\n")
				builder.WriteString("087782297657 - Menet CS\n")
				builder.WriteString("08987700897 - Elam\n")
				builder.WriteString("089621743796 - Ipong\n\n")
				builder.WriteString("Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n")
				builder.WriteString("Hormat kami,\n")
				builder.WriteString("Tim Billing — Menet Tech")
				renderedText = builder.String()
			}
		}
	case "trial_expired":
		var period string
		_ = s.Logs.DB.QueryRowContext(ctx, "SELECT periode FROM tagihan WHERE id = ?", payload.BillID).Scan(&period)
		if period != "" {
			type TrialInfo struct {
				Period   string
				Nominal  float64
				CustName string
				Invoice  string
				DueDate  string
			}
			var trials []TrialInfo
			rows, err := s.Logs.DB.QueryContext(ctx, `
				SELECT t.periode, t.nominal, p.name, t.invoice_number, t.jatuh_tempo
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				WHERE p.whatsapp = ? AND t.status = 'belum_bayar' AND t.periode = ?
				ORDER BY t.id ASC
			`, payload.PhoneNumber, period)
			if err == nil {
				for rows.Next() {
					var t TrialInfo
					if err := rows.Scan(&t.Period, &t.Nominal, &t.CustName, &t.Invoice, &t.DueDate); err == nil {
						trials = append(trials, t)
					}
				}
				rows.Close()
			}

			if len(trials) > 1 {
				primaryName := trials[0].CustName
				dueDateFormatted := formatDateLabel(trials[0].DueDate)
				var builder strings.Builder
				builder.WriteString(fmt.Sprintf("Pelanggan Yth,\nBapak/Ibu %s,\n\nMasa trial Anda telah berakhir.\n", primaryName))
				for i, t := range trials {
					priceStr := fmt.Sprintf("Rp. %s", formatThousandSeparator(int(t.Nominal)))
					if i < len(trials)-1 {
						builder.WriteString(fmt.Sprintf("Tagihan pertama periode %s sebesar %s atas nama %s dengan invoice %s,\n", t.Period, priceStr, t.CustName, t.Invoice))
					} else {
						builder.WriteString(fmt.Sprintf("Tagihan pertama periode %s sebesar %s atas nama %s dengan invoice %s. Sudah Kami Buat.\n", t.Period, priceStr, t.CustName, t.Invoice))
					}
				}
				builder.WriteString(fmt.Sprintf("\nMohon lakukan pembayaran sebelum tanggal %s untuk menghindari pembatasan layanan.\n\n", dueDateFormatted))
				builder.WriteString("Hormat kami,\n")
				builder.WriteString("Tim Billing — Menet Tech")
				renderedText = builder.String()
			}
		}
	}

	if renderedText == "" {
		renderedText = templates.Render(tpl.Content, payload.MessageData)
	}

	return s.QueueMessage(ctx, accountID, payload.PhoneNumber, renderedText, payload.BillID, payload.TriggerKey)
}

func (s WhatsAppService) QueueDirectMessage(ctx context.Context, accountID, toNumber, body string) error {
	return s.QueueMessage(ctx, accountID, toNumber, body, 0, "")
}

func (s WhatsAppService) SendDirectMessage(ctx context.Context, accountID, toNumber, body string) error {
	return s.sendDirect(ctx, QueuedMessage{
		AccountID: accountID,
		ToNumber:  toNumber,
		Body:      body,
	})
}

func (s WhatsAppService) QueueMessage(ctx context.Context, accountID, toNumber, body string, billID int64, triggerKey string) error {
	var bID sql.NullInt64
	if billID > 0 {
		bID = sql.NullInt64{Int64: billID, Valid: true}
	}
	var tKey sql.NullString
	if triggerKey != "" {
		tKey = sql.NullString{String: triggerKey, Valid: true}
	}

	_, err := s.Logs.DB.ExecContext(ctx, `
		INSERT INTO whatsapp_queue (account_id, to_number, body, status, attempts, bill_id, trigger_key)
		VALUES (?, ?, ?, 'pending', 0, ?, ?)
	`, accountID, toNumber, body, bID, tKey)
	if err != nil {
		return fmt.Errorf("insert into whatsapp_queue: %w", err)
	}
	return nil
}

func (s WhatsAppService) ProcessQueue(ctx context.Context) (bool, error) {
	row := s.Logs.DB.QueryRowContext(ctx, `
		SELECT id, account_id, to_number, body, status, attempts, bill_id, trigger_key
		FROM whatsapp_queue
		WHERE status = 'pending' AND attempts < 3
		ORDER BY id ASC
		LIMIT 1
	`)

	var msg QueuedMessage
	err := row.Scan(&msg.ID, &msg.AccountID, &msg.ToNumber, &msg.Body, &msg.Status, &msg.Attempts, &msg.BillID, &msg.TriggerKey)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("query pending message: %w", err)
	}

	_, _ = s.Logs.DB.ExecContext(ctx, `
		UPDATE whatsapp_queue
		SET attempts = attempts + 1
		WHERE id = ?
	`, msg.ID)
	msg.Attempts++

	sendErr := s.sendDirect(ctx, msg)

	now := time.Now().UTC().Format(time.RFC3339)
	if sendErr == nil {
		_, err = s.Logs.DB.ExecContext(ctx, `
			UPDATE whatsapp_queue
			SET status = 'sent', sent_at = ?
			WHERE id = ?
		`, now, msg.ID)
		if err != nil {
			slog.Error("failed to mark message as sent", "id", msg.ID, "error", err)
		}

		if msg.BillID.Valid && msg.TriggerKey.Valid {
			_ = s.Logs.Record(ctx, msg.BillID.Int64, msg.TriggerKey.String, msg.ToNumber, "sent", "OK")
		}
		slog.Info("queue: whatsapp message sent", "id", msg.ID, "to", msg.ToNumber)
		return true, nil
	}

	errMsg := sendErr.Error()
	status := "pending"
	if msg.Attempts >= 3 {
		status = "failed"
	}

	_, err = s.Logs.DB.ExecContext(ctx, `
		UPDATE whatsapp_queue
		SET status = ?, error_message = ?
		WHERE id = ?
	`, status, errMsg, msg.ID)
	if err != nil {
		slog.Error("failed to update failed message status", "id", msg.ID, "error", err)
	}

	if status == "failed" && msg.BillID.Valid && msg.TriggerKey.Valid {
		_ = s.Logs.Record(ctx, msg.BillID.Int64, msg.TriggerKey.String, msg.ToNumber, "failed", errMsg)
	}

	slog.Error("queue: whatsapp message failed to send", "id", msg.ID, "to", msg.ToNumber, "attempts", msg.Attempts, "error", sendErr)
	return true, sendErr
}

func (s WhatsAppService) sendDirect(ctx context.Context, msg QueuedMessage) error {
	url, err := s.Settings.GetString(ctx, settings.KeyWAGatewayURL)


	if err != nil {
		return err
	}
	trimmedURL := strings.TrimSpace(url)
	if envValue := strings.TrimSpace(os.Getenv("WA_GATEWAY_URL")); envValue != "" && (trimmedURL == "" || trimmedURL == "http://localhost:3001") {
		url = envValue
	}
	if strings.TrimSpace(url) == "" {
		url = os.Getenv("WA_GATEWAY_URL")
	}
	if strings.TrimSpace(url) == "" {
		url = "http://localhost:3001"
	}

	apiKey, err := s.Settings.GetString(ctx, settings.KeyWAAPIKey)
	if err != nil {
		return err
	}
	if strings.TrimSpace(apiKey) == "" {
		apiKey = os.Getenv("DASHBOARD_INTERNAL_API_KEY")
	}
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("WA API Key is not configured")
	}

	timeoutSecs, _ := s.Settings.GetInt(ctx, "wa_client_timeout_seconds")
	if timeoutSecs <= 0 {
		timeoutSecs = 15
	}

	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: time.Duration(timeoutSecs) * time.Second}
	} else if client.Timeout == 0 {
		client.Timeout = time.Duration(timeoutSecs) * time.Second
	}

	body, err := json.Marshal(map[string]string{
		"to":   msg.ToNumber,
		"text": msg.Body,
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
	if strings.TrimSpace(msg.AccountID) != "" {
		request.Header.Set("X-Account-Id", msg.AccountID)
	}

	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("send whatsapp message HTTP: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return fmt.Errorf("whatsapp gateway returned status %d", response.StatusCode)
	}

	return nil
}

func (s WhatsAppService) accountIDForTrigger(ctx context.Context, triggerKey string) (string, error) {
	settingKey := settings.KeyWAAccountID
	switch triggerKey {
	case "reminder-h5":
		settingKey = settings.KeyWAReminderAccountID
	case "jatuh_tempo", "trial_expired":
		settingKey = settings.KeyWADueAccountID
	case "limit_5hari":
		settingKey = settings.KeyWALimitAccountID
	case "lunas":
		settingKey = settings.KeyWAPaymentAccountID
	default:
		settingKey = settings.KeyWABillingAccountID
	}

	accountID, err := s.Settings.GetString(ctx, settingKey)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(accountID) != "" {
		return accountID, nil
	}
	return s.Settings.GetString(ctx, settings.KeyWAAccountID)
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

func formatThousandSeparator(amount int) string {
	value := strconv.Itoa(amount)
	if len(value) <= 3 {
		return value
	}

	parts := []byte{}
	offset := len(value) % 3
	if offset > 0 {
		parts = append(parts, value[:offset]...)
		if len(value) > offset {
			parts = append(parts, '.')
		}
	}

	for i := offset; i < len(value); i += 3 {
		parts = append(parts, value[i:i+3]...)
		if i+3 < len(value) {
			parts = append(parts, '.')
		}
	}

	return string(parts)
}

func formatDateLabel(raw string) string {
	value, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return raw
	}
	return value.Format("02-01-2006")
}

