package worker

import (
	"testing"
	"time"
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
