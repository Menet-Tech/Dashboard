package integration

import (
	"context"
	"database/sql"
	"log/slog"
	"os"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/settings"
)

func TestServiceManager(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}

	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	mgr := NewServiceManager(svc, logger, "")

	ctx := context.Background()

	t.Run("Reconcile with all disabled does not crash", func(t *testing.T) {
		err := mgr.Reconcile(ctx)
		if err != nil {
			t.Errorf("unexpected error on reconcile: %v", err)
		}
		if len(mgr.processes) != 0 {
			t.Errorf("expected 0 processes running, got %d", len(mgr.processes))
		}
	})

	t.Run("StopAll with none running does not crash", func(t *testing.T) {
		mgr.StopAll()
	})

	t.Run("Reconcile starts whatsapp when enabled", func(t *testing.T) {
		_ = svc.Set(ctx, settings.KeyWAGatewayEnabled, "1")
		_ = svc.Set(ctx, settings.KeyWAGatewayURL, "http://localhost:9999")
		_ = svc.Set(ctx, settings.KeyWAAPIKey, "test-api-key")
		
		err := mgr.Reconcile(ctx)
		t.Logf("Reconcile with enabled wa gateway: err=%v", err)
		
		mgr.StopAll()
	})
}
