package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/notifications"
)

func TestNotificationHandlerListByBill(t *testing.T) {
	db := handlerTestDB(t)
	repo := notifications.NotificationLogRepository{DB: db}
	h := handler.NewNotificationHandler(repo)

	if _, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'Home', 20, 100)`); err != nil {
		t.Fatalf("insert paket: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO pelanggan (id, nama, paket_id, tgl_jatuh_tempo) VALUES (1, 'Budi', 1, 8)`); err != nil {
		t.Fatalf("insert pelanggan: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, jatuh_tempo) VALUES (1, 1, 1, '2026-04', 'INV-001', '2026-04-08')`); err != nil {
		t.Fatalf("insert tagihan: %v", err)
	}

	// Create test log
	if err := repo.Record(t.Context(), 1, "test_trigger", "08123", "sent", "OK"); err != nil {
		t.Fatalf("record log: %v", err)
	}

	r := chi.NewRouter()
	r.Get("/bills/{id}/notifications", h.ListByBill)

	req := httptest.NewRequest(http.MethodGet, "/bills/1/notifications", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response struct {
		Data []notifications.NotificationLog `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Errorf("expected 1 log, got %d", len(response.Data))
	}
	if response.Data[0].TriggerKey != "test_trigger" {
		t.Errorf("expected trigger 'test_trigger', got %q", response.Data[0].TriggerKey)
	}
}
