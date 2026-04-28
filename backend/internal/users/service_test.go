package users

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestUserServiceCreateUpdateReset(t *testing.T) {
	db := usersTestDB(t)
	service := Service{Repository: Repository{DB: db}}

	created, err := service.Create(t.Context(), CreateInput{
		Username: "petugas1",
		Password: "password123",
		Role:     "petugas",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if created.Role != "petugas" {
		t.Fatalf("expected role petugas, got %s", created.Role)
	}

	updated, err := service.Update(t.Context(), created.ID, UpdateInput{
		Role:     "admin",
		IsActive: false,
	})
	if err != nil {
		t.Fatalf("update user: %v", err)
	}
	if updated.Role != "admin" || updated.IsActive {
		t.Fatalf("unexpected updated user: %+v", updated)
	}

	if err := service.ResetPassword(t.Context(), created.ID, ResetPasswordInput{Password: "newpass123"}); err != nil {
		t.Fatalf("reset password: %v", err)
	}
}

func usersTestDB(t *testing.T) *sql.DB {
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
