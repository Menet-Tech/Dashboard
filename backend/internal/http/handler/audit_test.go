package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/http/handler"
)

func TestAuditHandlerList(t *testing.T) {
	db := handlerTestDB(t)
	svc := audit.Service{Repository: audit.Repository{DB: db}}
	h := handler.NewAuditHandler(svc)

	userID := int64(1)
	if err := svc.Record(t.Context(), &userID, nil, "packages.create", "package dibuat"); err != nil {
		t.Fatalf("record audit: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/audit-logs", nil)
	req = req.WithContext(auth.WithUser(req.Context(), auth.User{ID: 1, Role: "admin"}))
	w := httptest.NewRecorder()
	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response struct {
		Data []audit.Entry `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Data) != 1 {
		t.Fatalf("expected 1 audit log, got %d", len(response.Data))
	}
}
