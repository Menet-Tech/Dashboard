package router_test

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/http/router"
	"menettech/dashboard/backend/internal/integration"
	"menettech/dashboard/backend/internal/settings"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL
		);
		CREATE TABLE router_aktif (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			host TEXT,
			username TEXT,
			password TEXT,
			role TEXT DEFAULT 'main'
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestRouterCreationAndEndpoints(t *testing.T) {
	db := setupTestDB(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.Config{AppName: "Menet-Tech Test"}

	settingsSvc := settings.Service{Repository: settings.Repository{DB: db}}
	authSvc := auth.Service{Repository: auth.Repository{DB: db}}
	serviceMgr := integration.NewServiceManager(settingsSvc, logger, ":memory:")

	handler := router.New(cfg, logger, db, authSvc, serviceMgr)
	if handler == nil {
		t.Fatal("expected non-nil http.Handler from router.New")
	}

	t.Run("Public Endpoint - /livez", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/livez", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		res := w.Result()
		if res.StatusCode != http.StatusOK {
			t.Errorf("expected status 200, got %d", res.StatusCode)
		}

		bodyBytes, _ := io.ReadAll(res.Body)
		body := string(bodyBytes)
		if !strings.Contains(body, `"status":"ok"`) {
			t.Errorf("expected response body to contain status ok, got %q", body)
		}
	})

	t.Run("Public Endpoint - /readyz", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		res := w.Result()
		if res.StatusCode != http.StatusOK {
			t.Errorf("expected status 200, got %d", res.StatusCode)
		}

		bodyBytes, _ := io.ReadAll(res.Body)
		body := string(bodyBytes)
		if !strings.Contains(body, `"message":"ready"`) {
			t.Errorf("expected response body to contain message ready, got %q", body)
		}
	})
}
