package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/notifications"
)

type NotificationHandler struct {
	Repo notifications.NotificationLogRepository
}

func NewNotificationHandler(repo notifications.NotificationLogRepository) NotificationHandler {
	return NotificationHandler{Repo: repo}
}

func (h NotificationHandler) ListByBill(w http.ResponseWriter, r *http.Request) {
	billIDRaw := chi.URLParam(r, "id")
	billID, err := strconv.ParseInt(billIDRaw, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID tagihan tidak valid")
		return
	}

	logs, err := h.Repo.FindLogs(r.Context(), billID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal mengambil riwayat notifikasi")
		return
	}

	if logs == nil {
		logs = []notifications.NotificationLog{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": logs})
}
