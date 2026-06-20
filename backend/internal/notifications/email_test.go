package notifications

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
	"menettech/dashboard/backend/internal/settings"
)

func TestEmailServiceQueueAndProcess(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	defer db.Close()

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	settingsRepo := settings.Repository{DB: db}
	settingsSvc := settings.Service{Repository: settingsRepo}

	emailSvc := NewEmailService(settingsSvc, db)

	ctx := context.Background()

	// 1. Initially queue should be empty
	processed, err := emailSvc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process queue: %v", err)
	}
	if processed {
		t.Fatal("expected processed to be false for empty queue")
	}

	// 2. Queue an email
	err = emailSvc.QueueEmail(ctx, "test@domain.com", "Test Subject", "Test Body")
	if err != nil {
		t.Fatalf("queue email: %v", err)
	}

	// Verify it's inserted into the database
	var count int
	err = db.QueryRowContext(ctx, "SELECT COUNT(1) FROM email_queue WHERE status = 'pending'").Scan(&count)
	if err != nil {
		t.Fatalf("query email_queue count: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 pending email in queue, got %d", count)
	}

	// 3. Test ProcessQueue with disabled SMTP.
	// Since SendDirect returns nil immediately when SMTP is disabled,
	// ProcessQueue should complete successfully and update status to 'sent'.
	processed, err = emailSvc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process queue with disabled SMTP: %v", err)
	}
	if !processed {
		t.Fatal("expected processed to be true")
	}

	// Verify the email status is updated to 'sent'
	var status string
	err = db.QueryRowContext(ctx, "SELECT status FROM email_queue WHERE to_email = 'test@domain.com'").Scan(&status)
	if err != nil {
		t.Fatalf("query status: %v", err)
	}
	if status != "sent" {
		t.Fatalf("expected status to be 'sent', got %q", status)
	}
}
