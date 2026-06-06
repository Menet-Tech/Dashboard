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
		SELECT nama, nomor_wa 
		FROM pelanggan 
		WHERE status != 'inactive' AND COALESCE(nomor_wa, '') != ''
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
	case "all":
		// No additional filters
	default:
		return 0, fmt.Errorf("invalid target type: %s", targetType)
	}

	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("query broadcast targets: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var name, phone string
		if err := rows.Scan(&name, &phone); err != nil {
			return count, fmt.Errorf("scan broadcast target: %w", err)
		}

		// Clean up phone number
		cleanPhone := strings.TrimSpace(phone)
		if cleanPhone == "" {
			continue
		}
		if !strings.Contains(cleanPhone, "@c.us") {
			cleanPhone = cleanPhone + "@c.us"
		}

		// Personalize message: replace {nama} with customer's name
		personalizedMsg := strings.ReplaceAll(message, "{nama}", name)

		// Queue the message
		err = s.WhatsApp.QueueDirectMessage(ctx, "default", cleanPhone, personalizedMsg)
		if err != nil {
			// Log and continue, don't abort the entire broadcast
			fmt.Printf("failed to queue broadcast message to %s: %v\n", cleanPhone, err)
			continue
		}
		count++
	}

	return count, rows.Err()
}
