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

func TestEmailQueueSkipsDuplicatePendingRows(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	defer db.Close()

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	emailSvc := NewEmailService(settings.Service{Repository: settings.Repository{DB: db}}, db)
	ctx := context.Background()

	if err := emailSvc.QueueEmail(ctx, "dup@domain.com", "Subject", "Body"); err != nil {
		t.Fatalf("queue first email: %v", err)
	}
	if err := emailSvc.QueueEmail(ctx, " dup@domain.com ", " Subject ", " Body "); err != nil {
		t.Fatalf("queue duplicate email: %v", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM email_queue`).Scan(&count); err != nil {
		t.Fatalf("count email queue rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected duplicate email queue to be skipped, got %d rows", count)
	}
}

func TestEmailProcessQueueTreatsSendFailureAsProcessed(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	defer db.Close()

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	settingsSvc := settings.Service{Repository: settings.Repository{DB: db}}
	ctx := context.Background()
	for key, value := range map[string]string{
		"smtp_enabled":    "true",
		"smtp_host":       "127.0.0.1",
		"smtp_port":       "1",
		"smtp_from_email": "noreply@example.com",
	} {
		if err := settingsSvc.Set(ctx, key, value); err != nil {
			t.Fatalf("set %s: %v", key, err)
		}
	}

	emailSvc := NewEmailService(settingsSvc, db)
	if err := emailSvc.QueueEmail(ctx, "test@domain.com", "Subject", "Body"); err != nil {
		t.Fatalf("queue email: %v", err)
	}

	processed, err := emailSvc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process queue should not return SMTP transport errors: %v", err)
	}
	if !processed {
		t.Fatal("expected queue item to be processed")
	}

	var status string
	var attempts int
	if err := db.QueryRowContext(ctx, `SELECT status, attempts FROM email_queue WHERE id = 1`).Scan(&status, &attempts); err != nil {
		t.Fatalf("query email queue status: %v", err)
	}
	if status != "pending" || attempts != 1 {
		t.Fatalf("expected pending status with one attempt, got status=%q attempts=%d", status, attempts)
	}
}
