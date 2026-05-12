package audit

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

type Entry struct {
	ID          int64   `json:"id"`
	UserID      *int64  `json:"user_id,omitempty"`
	Username    *string `json:"username,omitempty"`
	PelangganID *int64  `json:"pelanggan_id,omitempty"`
	Action      string  `json:"action"`
	Message     string  `json:"message"`
	IPAddress   *string `json:"ip_address,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) Record(ctx context.Context, userID *int64, pelangganID *int64, action, message string) error {
	return s.RecordWithIP(ctx, userID, pelangganID, action, message, "")
}

func (s Service) RecordWithIP(ctx context.Context, userID *int64, pelangganID *int64, action, message, ip string) error {
	action = strings.TrimSpace(action)
	if action == "" {
		return nil
	}
	return s.Repository.Insert(ctx, userID, pelangganID, action, strings.TrimSpace(message), strings.TrimSpace(ip))
}

func (s Service) List(ctx context.Context, limit int) ([]Entry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.Repository.List(ctx, limit)
}

func (r Repository) Insert(ctx context.Context, userID *int64, pelangganID *int64, action, message, ip string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO action_logs (user_id, pelanggan_id, action, message, ip_address)
		VALUES (?, ?, ?, ?, ?)
	`, userID, pelangganID, action, message, nullString(ip))
	if err != nil {
		return fmt.Errorf("insert action log: %w", err)
	}
	return nil
}

func (r Repository) List(ctx context.Context, limit int) ([]Entry, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT al.id, al.user_id, u.username, al.pelanggan_id, al.action,
		       COALESCE(al.message, ''), al.ip_address, al.created_at
		FROM action_logs al
		LEFT JOIN users u ON u.id = al.user_id
		ORDER BY al.id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list action logs: %w", err)
	}
	defer rows.Close()

	items := make([]Entry, 0, limit)
	for rows.Next() {
		var item Entry
		if err := rows.Scan(&item.ID, &item.UserID, &item.Username, &item.PelangganID, &item.Action, &item.Message, &item.IPAddress, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan action log: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
