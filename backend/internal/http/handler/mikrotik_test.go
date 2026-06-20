package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/mikrotik"
)

func TestMikrotikHandler_CRUD(t *testing.T) {
	db := handlerTestDB(t)
	routerSvc := mikrotik.NewRouterService(db)
	poller := mikrotik.NewTrafficPoller(routerSvc)
	h := handler.NewMikrotikHandler(routerSvc, poller)

	ctx := context.Background()

	// 1. Create Router
	payload := map[string]any{
		"name":      "Router A",
		"host":      "192.168.88.1:8728",
		"username":  "admin",
		"password":  "pass123",
		"is_active": true,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/routers", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.CreateRouter(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	var createResponse struct {
		Data mikrotik.Router `json:"data"`
	}
	_ = json.NewDecoder(w.Body).Decode(&createResponse)
	createdID := createResponse.Data.ID

	if createdID == 0 {
		t.Fatal("expected non-zero created router ID")
	}

	// 2. List Routers
	req = httptest.NewRequest(http.MethodGet, "/routers", nil)
	w = httptest.NewRecorder()
	h.ListRouters(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var listResponse struct {
		Data []mikrotik.Router `json:"data"`
	}
	_ = json.NewDecoder(w.Body).Decode(&listResponse)
	if len(listResponse.Data) != 1 {
		t.Errorf("expected 1 router, got %d", len(listResponse.Data))
	}

	// 3. Update Router
	updatePayload := map[string]any{
		"name":      "Router A Updated",
		"host":      "192.168.88.2:8728",
		"username":  "admin2",
		"password":  "newpass",
		"is_active": false,
	}
	body, _ = json.Marshal(updatePayload)
	req = httptest.NewRequest(http.MethodPut, "/routers/1", bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", strconv.FormatInt(createdID, 10))
	req = req.WithContext(context.WithValue(ctx, chi.RouteCtxKey, rctx))
	w = httptest.NewRecorder()
	h.UpdateRouter(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200 on update, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Verify updated router values
	updatedRouter, err := routerSvc.FindByID(ctx, createdID)
	if err != nil {
		t.Fatal(err)
	}
	if updatedRouter.Name != "Router A Updated" || updatedRouter.Username != "admin2" || updatedRouter.IsActive {
		t.Errorf("expected updated fields, got %+v", updatedRouter)
	}

	// 4. Delete Router
	req = httptest.NewRequest(http.MethodDelete, "/routers/1", nil)
	rctx = chi.NewRouteContext()
	rctx.URLParams.Add("id", strconv.FormatInt(createdID, 10))
	req = req.WithContext(context.WithValue(ctx, chi.RouteCtxKey, rctx))
	w = httptest.NewRecorder()
	h.DeleteRouter(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200 on delete, got %d", w.Code)
	}

	// Verify it is deleted
	_, err = routerSvc.FindByID(ctx, createdID)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected router to be not found, got err: %v", err)
	}
}

func TestMikrotikHandler_GetTrafficStats(t *testing.T) {
	db := handlerTestDB(t)
	routerSvc := mikrotik.NewRouterService(db)
	poller := mikrotik.NewTrafficPoller(routerSvc)
	h := handler.NewMikrotikHandler(routerSvc, poller)

	req := httptest.NewRequest(http.MethodGet, "/monitoring/traffic", nil)
	w := httptest.NewRecorder()
	h.GetTrafficStats(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response struct {
		Data map[string]any `json:"data"`
	}
	_ = json.NewDecoder(w.Body).Decode(&response)
	if response.Data == nil {
		t.Error("expected non-nil data map in response")
	}
}
