package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/settings"
)

func TestSettingsHandlerGetAndUpdate(t *testing.T) {
	db := handlerTestDB(t)
	repo := settings.Repository{DB: db}
	svc := settings.Service{Repository: repo}
	h := handler.NewSettingsHandler(svc)

	t.Run("Get settings", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/settings", nil)
		w := httptest.NewRecorder()
		h.Get(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var response struct {
			Data map[string]string `json:"data"`
		}
		if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		if val := response.Data[settings.KeyReminderDays]; val != "3" {
			t.Errorf("expected default reminder_days '3', got %q", val)
		}
	})

	t.Run("Update settings as admin", func(t *testing.T) {
		payload := map[string]string{
			settings.KeyReminderDays: "5",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(body))
		ctx := auth.WithUser(req.Context(), auth.User{Role: "admin"})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		h.Update(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		val, _ := svc.GetString(t.Context(), settings.KeyReminderDays)
		if val != "5" {
			t.Errorf("expected reminder_days '5', got %q", val)
		}
	})
}
