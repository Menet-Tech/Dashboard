package chatbot_forms_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/chatbot_forms"
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
		CREATE TABLE chatbot_forms (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			phone TEXT NOT NULL,
			account_id TEXT DEFAULT 'default',
			data TEXT,
			status TEXT DEFAULT 'pending',
			created_at DATETIME
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestChatbotFormService(t *testing.T) {
	db := setupTestDB(t)
	repo := chatbot_forms.Repository{DB: db}
	svc := chatbot_forms.Service{Repository: repo}
	ctx := context.Background()

	t.Run("Create Form - Validation Errors", func(t *testing.T) {
		_, err := svc.Create(ctx, chatbot_forms.ChatbotForm{Type: "", Phone: "0812"})
		if err == nil {
			t.Fatal("expected error with empty type")
		}

		_, err = svc.Create(ctx, chatbot_forms.ChatbotForm{Type: "register", Phone: ""})
		if err == nil {
			t.Fatal("expected error with empty phone")
		}
	})

	t.Run("Create Form - Success", func(t *testing.T) {
		input := chatbot_forms.ChatbotForm{
			ID:    "test-form-1",
			Type:  "register",
			Phone: "628123456",
			Data:  map[string]any{"package": "10Mbps", "name": "Irfan"},
		}

		created, err := svc.Create(ctx, input)
		if err != nil {
			t.Fatalf("failed to create chatbot form: %v", err)
		}

		if created.ID != "test-form-1" {
			t.Errorf("expected ID 'test-form-1', got %q", created.ID)
		}
		if created.Status != "pending" {
			t.Errorf("expected default status 'pending', got %q", created.Status)
		}
		if created.Data["name"] != "Irfan" {
			t.Errorf("expected data name Irfan, got %v", created.Data["name"])
		}
	})

	t.Run("List Forms", func(t *testing.T) {
		listAll, err := svc.List(ctx, "", 10)
		if err != nil {
			t.Fatalf("failed to list forms: %v", err)
		}
		if len(listAll) != 1 {
			t.Fatalf("expected 1 form, got %d", len(listAll))
		}

		listType, err := svc.List(ctx, "register", 10)
		if err != nil {
			t.Fatalf("failed to list forms by type: %v", err)
		}
		if len(listType) != 1 {
			t.Fatalf("expected 1 form of type register, got %d", len(listType))
		}

		listNone, err := svc.List(ctx, "non-existent", 10)
		if err != nil {
			t.Fatalf("failed to list forms: %v", err)
		}
		if len(listNone) != 0 {
			t.Errorf("expected 0 forms for non-existent type, got %d", len(listNone))
		}
	})

	t.Run("Update Status", func(t *testing.T) {
		updated, err := svc.UpdateStatus(ctx, "test-form-1", "approved")
		if err != nil {
			t.Fatalf("failed to update status: %v", err)
		}
		if updated.Status != "approved" {
			t.Errorf("expected status 'approved', got %q", updated.Status)
		}

		_, err = svc.UpdateStatus(ctx, "unknown-id", "approved")
		if !errors.Is(err, chatbot_forms.ErrFormNotFound) {
			t.Errorf("expected ErrFormNotFound, got %v", err)
		}
	})

	t.Run("Delete Form", func(t *testing.T) {
		err := svc.Delete(ctx, "test-form-1")
		if err != nil {
			t.Fatalf("failed to delete form: %v", err)
		}

		err = svc.Delete(ctx, "test-form-1")
		if !errors.Is(err, chatbot_forms.ErrFormNotFound) {
			t.Errorf("expected ErrFormNotFound on deleting deleted form, got %v", err)
		}
	})
}
