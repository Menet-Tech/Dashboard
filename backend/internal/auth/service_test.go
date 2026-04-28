package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestServiceBootstrapAndLogin(t *testing.T) {
	db := authTestDB(t)
	service := Service{
		Repository: Repository{DB: db},
		SessionTTL: 24 * time.Hour,
	}

	if err := service.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	user, session, err := service.Login(context.Background(), "admin", "password", "admin|127.0.0.1")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	if user.Username != "admin" {
		t.Fatalf("expected admin username, got %q", user.Username)
	}

	if session.Token == "" {
		t.Fatal("expected session token to be generated")
	}
}

func TestServiceLoginRejectsWrongPassword(t *testing.T) {
	db := authTestDB(t)
	service := Service{
		Repository: Repository{
			DB: db,
		},
		BootstrapAdminUsername: "admin",
		BootstrapAdminPassword: "password",
		SessionTTL:             24 * time.Hour,
	}

	if err := service.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	_, _, err := service.Login(context.Background(), "admin", "wrong", "admin|127.0.0.1")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected invalid credentials error, got %v", err)
	}
}

func TestServiceLoginRateLimit(t *testing.T) {
	db := authTestDB(t)
	service := Service{
		Repository: Repository{
			DB: db,
		},
		BootstrapAdminUsername: "admin",
		BootstrapAdminPassword: "password",
		SessionTTL:             24 * time.Hour,
		LoginMaxAttempts:       2,
		LoginWindow:            15 * time.Minute,
	}

	if err := service.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	identifier := "admin|127.0.0.1"
	_, _, _ = service.Login(context.Background(), "admin", "wrong", identifier)
	_, _, _ = service.Login(context.Background(), "admin", "wrong", identifier)
	_, _, err := service.Login(context.Background(), "admin", "password", identifier)
	if !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("expected too many attempts error, got %v", err)
	}
}

func authTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		t.Fatalf("enable sqlite foreign keys: %v", err)
	}

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	return db
}
