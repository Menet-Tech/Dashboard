package broadcast

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"menettech/dashboard/backend/internal/notifications"
)

type Service struct {
	DB       *sql.DB
	WhatsApp notifications.WhatsAppService
}

func (s Service) SendBroadcast(ctx context.Context, targetType string, targetIDs []int64, message string) (int, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return 0, fmt.Errorf("message is empty")
	}

	query := `
		SELECT nama, COALESCE(nomor_wa, ''), COALESCE(email, '')
		FROM pelanggan 
		WHERE status != 'inactive'
	`
	var args []interface{}

	switch targetType {
	case "active":
		query += " AND status = 'active'"
	case "limit":
		query += " AND status = 'limit'"
	case "selected":
		if len(targetIDs) == 0 {
			return 0, nil
		}
		placeholders := make([]string, len(targetIDs))
		for i, id := range targetIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += fmt.Sprintf(" AND id IN (%s)", strings.Join(placeholders, ","))
	case "odp":
		if len(targetIDs) == 0 {
			return 0, nil
		}
		placeholders := make([]string, len(targetIDs))
		for i, id := range targetIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += fmt.Sprintf(" AND odp_id IN (%s)", strings.Join(placeholders, ","))
	case "all":
		// No additional filters
	default:
		return 0, fmt.Errorf("invalid target type: %s", targetType)
	}

	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("query broadcast targets: %w", err)
	}
	type target struct {
		name  string
		phone string
		email string
	}

	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.name, &t.phone, &t.email); err != nil {
			return 0, fmt.Errorf("scan broadcast target: %w", err)
		}
		targets = append(targets, t)
	}
	rows.Close() // Tutup rows sesegera mungkin agar koneksi dilepas kembali ke pool

	count := 0
	for _, t := range targets {
		// Personalize message: replace {nama} with customer's name
		personalizedMsg := strings.ReplaceAll(message, "{nama}", t.name)
		queuedAny := false

		// Clean up phone number and queue if not empty
		cleanPhone := strings.TrimSpace(t.phone)
		if cleanPhone != "" {
			if !strings.Contains(cleanPhone, "@") {
				cleanPhone = cleanPhone + "@s.whatsapp.net"
			}
			err = s.WhatsApp.QueueDirectMessage(ctx, "default", cleanPhone, personalizedMsg)
			if err != nil {
				fmt.Printf("failed to queue broadcast message to %s: %v\n", cleanPhone, err)
			} else {
				queuedAny = true
			}
		}

		// Queue email if email is not empty
		cleanEmail := strings.TrimSpace(t.email)
		if cleanEmail != "" {
			_, err = s.DB.ExecContext(ctx, `
				INSERT INTO email_queue (to_email, subject, body, status, attempts)
				VALUES (?, 'Pesan Siaran (Broadcast)', ?, 'pending', 0)
			`, cleanEmail, personalizedMsg)
			if err != nil {
				fmt.Printf("failed to queue broadcast email to %s: %v\n", cleanEmail, err)
			} else {
				queuedAny = true
			}
		}

		if queuedAny {
			count++
		}
	}

	return count, nil
}
