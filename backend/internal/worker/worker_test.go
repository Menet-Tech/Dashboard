package worker

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/settings"
)

func TestShouldRunBackupNow(t *testing.T) {
	now := time.Date(2026, 4, 28, 2, 15, 0, 0, time.UTC)

	if !shouldRunBackupNow(now, "02:00") {
		t.Fatal("expected backup to run at or after scheduled minute")
	}

	if shouldRunBackupNow(now, "03:00") {
		t.Fatal("expected backup not to run before scheduled hour")
	}

	if !shouldRunBackupNow(now, "invalid") {
		t.Fatal("expected invalid schedule to fall back to default hour")
	}
}

func TestShouldRunBillingNow(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 6, 0, 0, time.UTC)

	if !shouldRunBillingNow(now, 1, "00:05") {
		t.Fatal("expected scheduled billing to run after configured time")
	}

	if shouldRunBillingNow(time.Date(2026, 5, 1, 0, 4, 0, 0, time.UTC), 1, "00:05") {
		t.Fatal("expected scheduled billing not to run before configured minute")
	}

	if !shouldRunBillingNow(time.Date(2026, 5, 4, 12, 0, 0, 0, time.UTC), 1, "00:05") {
		t.Fatal("expected missed schedule to catch up later in the month")
	}
}

func TestNextBillingRun(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 1, 0, 0, time.UTC)
	next := nextBillingRun(now, 1, "00:05")
	if got := next.Format(time.RFC3339); got != "2026-05-01T00:05:00Z" {
		t.Fatalf("expected same-month next run, got %s", got)
	}

	afterSchedule := time.Date(2026, 5, 1, 0, 6, 0, 0, time.UTC)
	next = nextBillingRun(afterSchedule, 1, "00:05")
	if got := next.Format(time.RFC3339); got != "2026-06-01T00:05:00Z" {
		t.Fatalf("expected next-month next run, got %s", got)
	}
}

func TestBillingInProgressActive(t *testing.T) {
	now := time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)
	value := formatBillingInProgress("2026-05", now.Add(-5*time.Minute))
	if !billingInProgressActive(value, "2026-05", now, 30*time.Minute) {
		t.Fatal("expected fresh in-progress marker to be active")
	}

	stale := formatBillingInProgress("2026-05", now.Add(-31*time.Minute))
	if billingInProgressActive(stale, "2026-05", now, 30*time.Minute) {
		t.Fatal("expected stale in-progress marker to be ignored")
	}

	if billingInProgressActive("2026-05", "2026-05", now, 30*time.Minute) {
		t.Fatal("expected legacy period-only marker to be treated as stale")
	}

	if billingInProgressActive(value, "2026-06", now, 30*time.Minute) {
		t.Fatal("expected marker for another period to be ignored")
	}
}

func TestRunLoopStaysAliveWhileLeaseHeldByAnotherWorker(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create settings table: %v", err)
	}

	settingsSvc := settings.Service{Repository: settings.Repository{DB: db}}
	otherOwnerUntil := time.Now().UTC().Add(time.Minute).Format(time.RFC3339)
	acquired, err := settingsSvc.TryAcquireLease(t.Context(), "worker_lock", "other-worker", otherOwnerUntil)
	if err != nil {
		t.Fatalf("other worker acquire lease: %v", err)
	}
	if !acquired {
		t.Fatal("expected other worker to acquire initial lease")
	}

	svc := Service{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Settings: settingsSvc,
		DB:       db,
	}

	ctx, cancel := context.WithTimeout(t.Context(), 50*time.Millisecond)
	defer cancel()

	err = svc.RunLoop(ctx, 10*time.Millisecond)
	if err == nil {
		t.Fatal("expected RunLoop to return only after context timeout, got nil")
	}
	if err != context.DeadlineExceeded {
		t.Fatalf("expected context deadline exceeded, got %v", err)
	}
}
