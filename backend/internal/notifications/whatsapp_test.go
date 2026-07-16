package notifications

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"testing"

	"menettech/dashboard/backend/internal/platform/migrate"
	"menettech/dashboard/backend/internal/settings"

	_ "modernc.org/sqlite"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newWhatsAppTestService(t *testing.T) (WhatsAppService, *sql.DB) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	t.Cleanup(func() { _ = db.Close() })

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	settingsSvc := settings.Service{Repository: settings.Repository{DB: db}}
	if err := settingsSvc.Set(context.Background(), settings.KeyWAAPIKey, "test-api-key"); err != nil {
		t.Fatalf("set wa api key: %v", err)
	}
	if err := settingsSvc.Set(context.Background(), settings.KeyWAGatewayURL, "http://wa-gateway.local"); err != nil {
		t.Fatalf("set wa gateway url: %v", err)
	}

	return WhatsAppService{
		Settings: settingsSvc,
		Logs:     NotificationLogRepository{DB: db},
	}, db
}

func TestWhatsAppQueueMessageSkipsDuplicateAutomationRows(t *testing.T) {
	ctx := context.Background()
	svc, db := newWhatsAppTestService(t)

	if err := svc.QueueMessage(ctx, "default", "+62 899-4796-947", "body", 42, "tagihan-h7", false); err != nil {
		t.Fatalf("queue first message: %v", err)
	}
	if err := svc.QueueMessage(ctx, "default", "+62 899-4796-947", "body updated", 42, "tagihan-h7", false); err != nil {
		t.Fatalf("queue duplicate message: %v", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM whatsapp_queue`).Scan(&count); err != nil {
		t.Fatalf("count queue rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected duplicate automation queue to be skipped, got %d rows", count)
	}

	if _, err := db.ExecContext(ctx, `UPDATE whatsapp_queue SET status = 'failed', attempts = 3 WHERE id = 1`); err != nil {
		t.Fatalf("mark queue failed: %v", err)
	}
	if err := svc.QueueMessage(ctx, "default", "+62 899-4796-947", "body after failed", 42, "tagihan-h7", false); err != nil {
		t.Fatalf("queue duplicate failed message: %v", err)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM whatsapp_queue`).Scan(&count); err != nil {
		t.Fatalf("count queue rows after failed duplicate: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected failed automation queue to block requeue, got %d rows", count)
	}
}

func TestWhatsAppProcessQueueTreatsSendFailureAsProcessed(t *testing.T) {
	ctx := context.Background()
	svc, db := newWhatsAppTestService(t)
	svc.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("gateway offline")
		}),
	}

	if err := svc.QueueMessage(ctx, "default", "+62 877-2739-2609", "body", 7, "tagihan-h7", false); err != nil {
		t.Fatalf("queue message: %v", err)
	}

	processed, isManual, err := svc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process queue should not return transport errors: %v", err)
	}
	if !processed {
		t.Fatal("expected queue item to be processed")
	}
	if isManual {
		t.Fatal("expected automatic queue item")
	}

	var status string
	var attempts int
	if err := db.QueryRowContext(ctx, `SELECT status, attempts FROM whatsapp_queue WHERE id = 1`).Scan(&status, &attempts); err != nil {
		t.Fatalf("query queue status: %v", err)
	}
	if status != "pending" || attempts != 1 {
		t.Fatalf("expected pending status with one attempt, got status=%q attempts=%d", status, attempts)
	}
}

func TestWhatsAppProcessQueueSkipsExistingDuplicateBeforeSend(t *testing.T) {
	ctx := context.Background()
	svc, db := newWhatsAppTestService(t)
	var calls int
	svc.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			calls++
			return nil, errors.New("should not send duplicate")
		}),
	}

	_, err := db.ExecContext(ctx, `
		INSERT INTO whatsapp_queue (id, account_id, to_number, body, status, attempts, bill_id, trigger_key, is_manual)
		VALUES
			(1, 'default', '+62 899-4796-947', 'old body', 'failed', 3, 42, 'tagihan-h7', 0),
			(2, 'default', '+62 899-4796-947', 'duplicate body', 'pending', 0, 42, 'tagihan-h7', 0)
	`)
	if err != nil {
		t.Fatalf("seed duplicate queue rows: %v", err)
	}

	processed, _, err := svc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process duplicate queue: %v", err)
	}
	if !processed {
		t.Fatal("expected duplicate queue item to be processed as skipped")
	}
	if calls != 0 {
		t.Fatalf("expected duplicate queue to be skipped before HTTP send, got %d calls", calls)
	}

	var status, errMsg string
	if err := db.QueryRowContext(ctx, `SELECT status, error_message FROM whatsapp_queue WHERE id = 2`).Scan(&status, &errMsg); err != nil {
		t.Fatalf("query duplicate queue status: %v", err)
	}
	if status != "failed" || errMsg == "" {
		t.Fatalf("expected duplicate row to be marked failed with an error message, got status=%q error=%q", status, errMsg)
	}
}

func TestWhatsAppGroupedMessageLogsAllBillsAfterGatewaySuccess(t *testing.T) {
	ctx := context.Background()
	svc, db := newWhatsAppTestService(t)
	svc.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
		}),
	}

	if err := svc.QueueGroupedMessage(ctx, "default", "+62 899-4796-947", "combined body", []int64{10, 11, 10}, "tagihan-h7"); err != nil {
		t.Fatalf("queue grouped message: %v", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM notification_logs`).Scan(&count); err != nil {
		t.Fatalf("count notification logs before send: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no notification logs before gateway success, got %d", count)
	}

	processed, isManual, err := svc.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("process grouped queue: %v", err)
	}
	if !processed {
		t.Fatal("expected grouped queue item to be processed")
	}
	if isManual {
		t.Fatal("expected grouped automation queue item")
	}

	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM notification_logs
		WHERE trigger_key = 'tagihan-h7'
		  AND status = 'sent'
		  AND bill_id IN (10, 11)
	`).Scan(&count); err != nil {
		t.Fatalf("count grouped notification logs after send: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected sent logs for both grouped bills, got %d", count)
	}
}
