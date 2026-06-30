package audit_test

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/audit"
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
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL
		);
		CREATE TABLE action_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			pelanggan_id INTEGER,
			action TEXT NOT NULL,
			message TEXT,
			ip_address TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestAuditService(t *testing.T) {
	db := setupTestDB(t)
	repo := audit.Repository{DB: db}
	svc := audit.Service{Repository: repo}
	ctx := context.Background()

	// Seed user
	_, err := db.Exec("INSERT INTO users (id, username) VALUES (10, 'admin_user')")
	if err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}

	t.Run("Record log without IP", func(t *testing.T) {
		userID := int64(10)
		err := svc.Record(ctx, &userID, nil, "CREATE_USER", "Created new user")
		if err != nil {
			t.Fatalf("failed to record audit entry: %v", err)
		}

		logs, err := svc.List(ctx, 10)
		if err != nil {
			t.Fatalf("failed to list audit entries: %v", err)
		}
		if len(logs) != 1 {
			t.Fatalf("expected 1 log entry, got %d", len(logs))
		}
		if logs[0].Action != "CREATE_USER" {
			t.Errorf("expected Action CREATE_USER, got %q", logs[0].Action)
		}
		if logs[0].Username == nil || *logs[0].Username != "admin_user" {
			t.Errorf("expected Username 'admin_user', got %v", logs[0].Username)
		}
	})

	t.Run("Record log with IP and empty action validation", func(t *testing.T) {
		// Empty action should do nothing and return nil
		err := svc.Record(ctx, nil, nil, "", "Empty action")
		if err != nil {
			t.Fatalf("expected nil error on empty action, got %v", err)
		}

		// Record with IP address
		ip := "192.168.1.100"
		err = svc.RecordWithIP(ctx, nil, nil, "LOGIN", "Successful login", ip)
		if err != nil {
			t.Fatalf("failed to record audit entry with IP: %v", err)
		}

		logs, err := svc.List(ctx, 10)
		if err != nil {
			t.Fatalf("failed to list audit entries: %v", err)
		}
		if len(logs) != 2 { // 1 from previous test, 1 from this test
			t.Fatalf("expected 2 log entries, got %d", len(logs))
		}
		if logs[0].IPAddress == nil || *logs[0].IPAddress != "192.168.1.100" {
			t.Errorf("expected IP '192.168.1.100', got %v", logs[0].IPAddress)
		}
	})

	t.Run("List limit validation", func(t *testing.T) {
		// List with invalid limit uses default 50
		logs, err := svc.List(ctx, 0)
		if err != nil {
			t.Fatalf("failed to list audit entries with 0 limit: %v", err)
		}
		if len(logs) != 2 {
			t.Errorf("expected 2 log entries, got %d", len(logs))
		}
	})
}
