package chatbot_forms

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

var ErrFormNotFound = errors.New("form pendaftaran tidak ditemukan")

type ChatbotForm struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Phone     string         `json:"phone"`
	AccountID string         `json:"account_id"`
	Data      map[string]any `json:"data"`
	Status    string         `json:"status"`
	CreatedAt string         `json:"created_at"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func generateRandomHex(n int) string {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

func (s Service) List(ctx context.Context, formType string, limit int) ([]ChatbotForm, error) {
	if limit <= 0 {
		limit = 50
	}

	var rows *sql.Rows
	var err error

	if formType != "" {
		rows, err = s.Repository.DB.QueryContext(ctx, `
			SELECT id, type, phone, account_id, data, status, created_at
			FROM chatbot_forms
			WHERE type = ?
			ORDER BY created_at DESC
			LIMIT ?
		`, formType, limit)
	} else {
		rows, err = s.Repository.DB.QueryContext(ctx, `
			SELECT id, type, phone, account_id, data, status, created_at
			FROM chatbot_forms
			ORDER BY created_at DESC
			LIMIT ?
		`, limit)
	}

	if err != nil {
		return nil, fmt.Errorf("list chatbot forms: %w", err)
	}
	defer rows.Close()

	items := []ChatbotForm{}
	for rows.Next() {
		var item ChatbotForm
		var dataStr string
		if err := rows.Scan(&item.ID, &item.Type, &item.Phone, &item.AccountID, &dataStr, &item.Status, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Data = make(map[string]any)
		if dataStr != "" {
			_ = json.Unmarshal([]byte(dataStr), &item.Data)
		}
		items = append(items, item)
	}
	return items, nil
}

func (s Service) Create(ctx context.Context, f ChatbotForm) (ChatbotForm, error) {
	if f.ID == "" {
		f.ID = generateRandomHex(8) // 16 hex chars
	}
	if f.Type == "" {
		return ChatbotForm{}, errors.New("type is required")
	}
	if f.Phone == "" {
		return ChatbotForm{}, errors.New("phone is required")
	}
	if f.AccountID == "" {
		f.AccountID = "default"
	}
	if f.Status == "" {
		f.Status = "pending"
	}
	if f.CreatedAt == "" {
		f.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if f.Data == nil {
		f.Data = make(map[string]any)
	}

	dataBytes, err := json.Marshal(f.Data)
	if err != nil {
		return ChatbotForm{}, fmt.Errorf("marshal data: %w", err)
	}

	_, err = s.Repository.DB.ExecContext(ctx, `
		INSERT INTO chatbot_forms (id, type, phone, account_id, data, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, f.ID, f.Type, f.Phone, f.AccountID, string(dataBytes), f.Status, f.CreatedAt)

	if err != nil {
		return ChatbotForm{}, fmt.Errorf("create chatbot form: %w", err)
	}

	return f, nil
}

func (s Service) UpdateStatus(ctx context.Context, id string, status string) (ChatbotForm, error) {
	result, err := s.Repository.DB.ExecContext(ctx, `
		UPDATE chatbot_forms
		SET status = ?
		WHERE id = ?
	`, status, id)
	if err != nil {
		return ChatbotForm{}, fmt.Errorf("update status: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return ChatbotForm{}, err
	}
	if affected == 0 {
		return ChatbotForm{}, ErrFormNotFound
	}

	var item ChatbotForm
	var dataStr string
	err = s.Repository.DB.QueryRowContext(ctx, `
		SELECT id, type, phone, account_id, data, status, created_at
		FROM chatbot_forms
		WHERE id = ?
		LIMIT 1
	`, id).Scan(&item.ID, &item.Type, &item.Phone, &item.AccountID, &dataStr, &item.Status, &item.CreatedAt)

	if err != nil {
		return ChatbotForm{}, err
	}

	item.Data = make(map[string]any)
	if dataStr != "" {
		_ = json.Unmarshal([]byte(dataStr), &item.Data)
	}

	return item, nil
}

func (s Service) Delete(ctx context.Context, id string) error {
	result, err := s.Repository.DB.ExecContext(ctx, `
		DELETE FROM chatbot_forms
		WHERE id = ?
	`, id)
	if err != nil {
		return fmt.Errorf("delete chatbot form: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrFormNotFound
	}
	return nil
}
