package tickets

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/notifications"
)

var ErrTicketNotFound = errors.New("ticket not found")

type Ticket struct {
	ID          int64   `json:"id"`
	PelangganID *int64  `json:"pelanggan_id,omitempty"`
	Nama        string  `json:"nama"`
	NoHP        string  `json:"no_hp"`
	Alamat      string  `json:"alamat"`
	Kendala     string  `json:"kendala"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type TicketMessage struct {
	ID         int64   `json:"id"`
	TicketID   int64   `json:"ticket_id"`
	SenderType string  `json:"sender_type"` // 'admin' or 'customer'
	Message    string  `json:"message"`
	CreatedAt  string  `json:"created_at"`
	IsRead     int     `json:"is_read"`
	ReadAt     *string `json:"read_at,omitempty"`
}

type TicketDetail struct {
	Ticket
	CustomerName  string          `json:"customer_name,omitempty"`
	Messages      []TicketMessage `json:"messages"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
	WhatsApp   notifications.WhatsAppService
}

func (s Service) ListTickets(ctx context.Context, status string) ([]Ticket, error) {
	return s.Repository.List(ctx, status)
}

func (s Service) GetTicketDetail(ctx context.Context, id int64) (TicketDetail, error) {
	// Mark messages from customer as read when admin fetches detail
	_, _ = s.Repository.DB.ExecContext(ctx, `
		UPDATE ticket_messages 
		SET is_read = 1, read_at = CURRENT_TIMESTAMP 
		WHERE ticket_id = ? AND sender_type = 'customer' AND is_read = 0`,
		id,
	)
	return s.Repository.FindByID(ctx, id)
}

func (s Service) CreateTicket(ctx context.Context, ticket Ticket) (Ticket, error) {
	ticket.Nama = strings.TrimSpace(ticket.Nama)
	ticket.NoHP = strings.TrimSpace(ticket.NoHP)
	ticket.Alamat = strings.TrimSpace(ticket.Alamat)
	ticket.Kendala = strings.TrimSpace(ticket.Kendala)

	if ticket.Nama == "" || ticket.NoHP == "" || ticket.Kendala == "" {
		return Ticket{}, errors.New("nama, no_hp, and kendala are required")
	}

	// Try to match phone number to associate with an existing pelanggan
	cleanPhone := strings.ReplaceAll(ticket.NoHP, "@c.us", "")
	cleanPhone = strings.TrimPrefix(cleanPhone, "+")
	if strings.HasPrefix(cleanPhone, "0") {
		cleanPhone = "62" + cleanPhone[1:]
	}

	var pelangganID int64
	err := s.Repository.DB.QueryRowContext(ctx, `
		SELECT id FROM pelanggan 
		WHERE nomor_wa = ? OR nomor_wa = ? OR nomor_wa = ? OR nomor_wa = ?
		LIMIT 1
	`, cleanPhone, "0"+cleanPhone[2:], "+"+cleanPhone, ticket.NoHP).Scan(&pelangganID)
	if err == nil && pelangganID > 0 {
		ticket.PelangganID = &pelangganID
	}

	return s.Repository.Create(ctx, ticket)
}

func (s Service) AddTicketMessage(ctx context.Context, ticketID int64, senderType, message string) (TicketMessage, error) {
	senderType = strings.TrimSpace(senderType)
	message = strings.TrimSpace(message)

	if message == "" || (senderType != "admin" && senderType != "customer") {
		return TicketMessage{}, errors.New("invalid sender_type or empty message")
	}

	detail, err := s.Repository.FindByID(ctx, ticketID)
	if err != nil {
		return TicketMessage{}, err
	}

	msg, err := s.Repository.AddMessage(ctx, ticketID, senderType, message)
	if err != nil {
		return TicketMessage{}, err
	}

	// If the message is from admin, send/queue it to WhatsApp
	if senderType == "admin" {
		// Clean phone for WhatsApp destination
		targetPhone := detail.NoHP
		if !strings.Contains(targetPhone, "@c.us") {
			targetPhone = targetPhone + "@c.us"
		}
		
		// Send reply via WA queue
		err = s.WhatsApp.QueueDirectMessage(ctx, "default", targetPhone, message)
		if err != nil {
			// Don't rollback message creation, just log error
			fmt.Printf("failed to queue ticket reply to whatsapp: %v\n", err)
		}
	}

	return msg, nil
}

func (s Service) CloseTicket(ctx context.Context, id int64) error {
	return s.Repository.Close(ctx, id)
}

// Repository implementation

func (r Repository) List(ctx context.Context, status string) ([]Ticket, error) {
	query := `
		SELECT id, pelanggan_id, nama, no_hp, alamat, kendala, status, created_at, updated_at
		FROM tickets
	`
	var args []interface{}
	if status != "" {
		query += " WHERE status = ?"
		args = append(args, status)
	}
	query += " ORDER BY id DESC"

	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list tickets: %w", err)
	}
	defer rows.Close()

	items := []Ticket{}
	for rows.Next() {
		var item Ticket
		var pID sql.NullInt64
		if err := rows.Scan(
			&item.ID,
			&pID,
			&item.Nama,
			&item.NoHP,
			&item.Alamat,
			&item.Kendala,
			&item.Status,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan ticket: %w", err)
		}
		if pID.Valid {
			item.PelangganID = &pID.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) FindByID(ctx context.Context, id int64) (TicketDetail, error) {
	var detail TicketDetail
	var pID sql.NullInt64
	var customerName sql.NullString

	err := r.DB.QueryRowContext(ctx, `
		SELECT t.id, t.pelanggan_id, t.nama, t.no_hp, t.alamat, t.kendala, t.status, t.created_at, t.updated_at, c.nama
		FROM tickets t
		LEFT JOIN pelanggan c ON c.id = t.pelanggan_id
		WHERE t.id = ?
		LIMIT 1
	`, id).Scan(
		&detail.ID,
		&pID,
		&detail.Nama,
		&detail.NoHP,
		&detail.Alamat,
		&detail.Kendala,
		&detail.Status,
		&detail.CreatedAt,
		&detail.UpdatedAt,
		&customerName,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return TicketDetail{}, ErrTicketNotFound
		}
		return TicketDetail{}, fmt.Errorf("find ticket: %w", err)
	}

	if pID.Valid {
		detail.PelangganID = &pID.Int64
	}
	if customerName.Valid {
		detail.CustomerName = customerName.String
	}

	// Fetch messages
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, ticket_id, sender_type, message, created_at, is_read, COALESCE(read_at, '')
		FROM ticket_messages
		WHERE ticket_id = ?
		ORDER BY id ASC
	`, id)
	if err != nil {
		return TicketDetail{}, fmt.Errorf("fetch ticket messages: %w", err)
	}
	defer rows.Close()

	detail.Messages = []TicketMessage{}
	for rows.Next() {
		var msg TicketMessage
		var readAtVal sql.NullString
		if err := rows.Scan(
			&msg.ID,
			&msg.TicketID,
			&msg.SenderType,
			&msg.Message,
			&msg.CreatedAt,
			&msg.IsRead,
			&readAtVal,
		); err != nil {
			return TicketDetail{}, fmt.Errorf("scan ticket message: %w", err)
		}
		if readAtVal.Valid && readAtVal.String != "" {
			msg.ReadAt = &readAtVal.String
		}
		detail.Messages = append(detail.Messages, msg)
	}

	return detail, nil
}

func (r Repository) Create(ctx context.Context, t Ticket) (Ticket, error) {
	var pID sql.NullInt64
	if t.PelangganID != nil {
		pID = sql.NullInt64{Int64: *t.PelangganID, Valid: true}
	}

	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO tickets (pelanggan_id, nama, no_hp, alamat, kendala, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`, pID, t.Nama, t.NoHP, t.Alamat, t.Kendala)
	if err != nil {
		return Ticket{}, fmt.Errorf("insert ticket: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Ticket{}, fmt.Errorf("get last insert id: %w", err)
	}

	t.ID = id
	t.Status = "open"
	t.CreatedAt = time.Now().Format(time.RFC3339)
	t.UpdatedAt = time.Now().Format(time.RFC3339)
	return t, nil
}

func (r Repository) AddMessage(ctx context.Context, ticketID int64, senderType, message string) (TicketMessage, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return TicketMessage{}, fmt.Errorf("begin add message tx: %w", err)
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO ticket_messages (ticket_id, sender_type, message, created_at, is_read)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)
	`, ticketID, senderType, message)
	if err != nil {
		_ = tx.Rollback()
		return TicketMessage{}, fmt.Errorf("insert ticket message: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return TicketMessage{}, fmt.Errorf("get message insert id: %w", err)
	}

	// Update ticket updated_at
	_, err = tx.ExecContext(ctx, `
		UPDATE tickets
		SET updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, ticketID)
	if err != nil {
		_ = tx.Rollback()
		return TicketMessage{}, fmt.Errorf("update ticket updated_at: %w", err)
	}

	// If the message is from customer, mark all previous admin messages for this ticket as read!
	if senderType == "customer" {
		_, err = tx.ExecContext(ctx, `
			UPDATE ticket_messages 
			SET is_read = 1, read_at = CURRENT_TIMESTAMP 
			WHERE ticket_id = ? AND sender_type = 'admin' AND is_read = 0`,
			ticketID,
		)
		if err != nil {
			_ = tx.Rollback()
			return TicketMessage{}, fmt.Errorf("mark admin messages read: %w", err)
		}
	}

	// If the message is from admin, mark all previous customer messages for this ticket as read!
	if senderType == "admin" {
		_, err = tx.ExecContext(ctx, `
			UPDATE ticket_messages 
			SET is_read = 1, read_at = CURRENT_TIMESTAMP 
			WHERE ticket_id = ? AND sender_type = 'customer' AND is_read = 0`,
			ticketID,
		)
		if err != nil {
			_ = tx.Rollback()
			return TicketMessage{}, fmt.Errorf("mark customer messages read: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return TicketMessage{}, fmt.Errorf("commit add message tx: %w", err)
	}

	return TicketMessage{
		ID:         id,
		TicketID:   ticketID,
		SenderType: senderType,
		Message:    message,
		CreatedAt:  time.Now().Format(time.RFC3339),
		IsRead:     0,
	}, nil
}

func (r Repository) Close(ctx context.Context, id int64) error {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE tickets
		SET status = 'closed', updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, id)
	if err != nil {
		return fmt.Errorf("update ticket status to closed: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("close ticket rows affected: %w", err)
	}

	if affected == 0 {
		return ErrTicketNotFound
	}

	return nil
}
