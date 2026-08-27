package notifications

import (
	"context"
	"crypto/tls"
	"database/sql"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/settings"
)

type EmailService struct {
	Settings settings.Service
	DB       *sql.DB
}

func NewEmailService(settingsSvc settings.Service, db *sql.DB) *EmailService {
	return &EmailService{
		Settings: settingsSvc,
		DB:       db,
	}
}

// QueueEmail adds a new email message to the queue to be sent asynchronously by the worker.
func (s *EmailService) QueueEmail(ctx context.Context, toEmail, subject, body string) error {
	toEmail = strings.TrimSpace(toEmail)
	subject = strings.TrimSpace(subject)
	body = strings.TrimSpace(body)

	if toEmail == "" || subject == "" || body == "" {
		return nil // skip silently if empty
	}

	var existingID int64
	err := s.DB.QueryRowContext(ctx, `
		SELECT id
		FROM email_queue
		WHERE to_email = ?
		  AND subject = ?
		  AND body = ?
		  AND status IN ('pending', 'failed')
		ORDER BY id DESC
		LIMIT 1
	`, toEmail, subject, body).Scan(&existingID)
	if err == nil {
		slog.Info("duplicate email queue skipped", "existing_id", existingID, "to", toEmail, "subject", subject)
		return nil
	}
	if err != sql.ErrNoRows {
		return fmt.Errorf("check existing email_queue: %w", err)
	}

	_, err = s.DB.ExecContext(ctx, `
		INSERT INTO email_queue (to_email, subject, body, status, attempts)
		VALUES (?, ?, ?, 'pending', 0)
	`, toEmail, subject, body)
	if err != nil {
		return fmt.Errorf("queue email message: %w", err)
	}

	slog.Info("email message queued successfully", "to", toEmail, "subject", subject)
	return nil
}

// ProcessQueue pulls one pending email, attempts to send it, and updates its status.
func (s *EmailService) ProcessQueue(ctx context.Context) (bool, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT id, to_email, subject, body, attempts
		FROM email_queue
		WHERE status = 'pending' AND attempts < 3
		ORDER BY id ASC
		LIMIT 1
	`)

	var id int64
	var toEmail, subject, body string
	var attempts int
	err := row.Scan(&id, &toEmail, &subject, &body, &attempts)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("query pending email: %w", err)
	}

	// Increment attempts immediately
	_, _ = s.DB.ExecContext(ctx, `
		UPDATE email_queue
		SET attempts = attempts + 1
		WHERE id = ?
	`, id)
	attempts++

	// Send SMTP email
	sendErr := s.SendDirect(ctx, toEmail, subject, body)

	now := time.Now().UTC().Format(time.RFC3339)
	if sendErr == nil {
		_, err = s.DB.ExecContext(ctx, `
			UPDATE email_queue
			SET status = 'sent', sent_at = ?
			WHERE id = ?
		`, now, id)
		if err != nil {
			slog.Error("failed to update email status as sent", "id", id, "error", err)
		}
		slog.Info("queue: email message sent successfully", "id", id, "to", toEmail)
		return true, nil
	}

	errMsg := sendErr.Error()
	status := "pending"
	if attempts >= 3 {
		status = "failed"
	}

	_, err = s.DB.ExecContext(ctx, `
		UPDATE email_queue
		SET status = ?, error_message = ?
		WHERE id = ?
	`, status, errMsg, id)
	if err != nil {
		slog.Error("failed to update failed email message status", "id", id, "error", err)
	}

	slog.Error("queue: email message failed to send", "id", id, "to", toEmail, "attempts", attempts, "error", sendErr)
	return true, nil
}

// SendDirect connects to the SMTP server and transmits the message immediately.
func (s *EmailService) SendDirect(ctx context.Context, to, subject, body string) error {
	enabled, _ := s.Settings.GetString(ctx, "smtp_enabled")
	if enabled != "1" && enabled != "true" {
		return nil // skip if not enabled
	}

	host, _ := s.Settings.GetString(ctx, "smtp_host")
	portStr, _ := s.Settings.GetString(ctx, "smtp_port")
	username, _ := s.Settings.GetString(ctx, "smtp_username")
	password, _ := s.Settings.GetString(ctx, "smtp_password")
	fromEmail, _ := s.Settings.GetString(ctx, "smtp_from_email")
	encryption, _ := s.Settings.GetString(ctx, "smtp_encryption")

	if strings.TrimSpace(host) == "" || strings.TrimSpace(to) == "" {
		return fmt.Errorf("SMTP host or recipient address is empty")
	}

	if strings.TrimSpace(portStr) == "" {
		portStr = "587"
	}

	addr := net.JoinHostPort(host, portStr)
	var auth smtp.Auth
	if username != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}

	// Format MIME RFC822 message headers and body
	msg := fmt.Appendf(nil, "To: %s\r\n"+
		"From: %s\r\n"+
		"Subject: %s\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"MIME-Version: 1.0\r\n"+
		"\r\n"+
		"%s\r\n", to, fromEmail, subject, body)

	// Direct SSL/TLS (commonly on port 465)
	if strings.ToLower(encryption) == "ssl" || portStr == "465" {
		tlsconfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         host,
		}

		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, tlsconfig)
		if err != nil {
			return fmt.Errorf("tls dial error: %w", err)
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("smtp new client error: %w", err)
		}
		defer c.Close()

		if auth != nil {
			if ok, _ := c.Extension("AUTH"); ok {
				if err = c.Auth(auth); err != nil {
					return fmt.Errorf("smtp auth error: %w", err)
				}
			}
		}

		if err = c.Mail(fromEmail); err != nil {
			return fmt.Errorf("smtp mail command: %w", err)
		}
		if err = c.Rcpt(to); err != nil {
			return fmt.Errorf("smtp rcpt command: %w", err)
		}

		w, err := c.Data()
		if err != nil {
			return fmt.Errorf("smtp data command: %w", err)
		}

		if _, err = w.Write(msg); err != nil {
			return fmt.Errorf("write mail message body: %w", err)
		}

		if err = w.Close(); err != nil {
			return fmt.Errorf("close mail message writer: %w", err)
		}

		return c.Quit()
	}

	// Standard TCP + STARTTLS (commonly on port 587 or 25)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("tcp dial error: %w", err)
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp new client error: %w", err)
	}
	defer c.Close()

	if strings.ToLower(encryption) == "tls" || strings.ToLower(encryption) == "starttls" || portStr == "587" {
		tlsconfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         host,
		}
		if err = c.StartTLS(tlsconfig); err != nil {
			return fmt.Errorf("smtp starttls command: %w", err)
		}
	}

	if auth != nil {
		if ok, _ := c.Extension("AUTH"); ok {
			if err = c.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth error: %w", err)
			}
		}
	}

	if err = c.Mail(fromEmail); err != nil {
		return fmt.Errorf("smtp mail command: %w", err)
	}
	if err = c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt command: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data command: %w", err)
	}

	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("write mail message body: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("close mail message writer: %w", err)
	}

	return c.Quit()
}
