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
