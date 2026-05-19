package handler

import (
	"database/sql"
	"net/http"

	"menettech/dashboard/backend/internal/service"
)

type DashboardHandler struct {
	SummaryService *service.DashboardSummaryService
}

func NewDashboardHandler(db *sql.DB) DashboardHandler {
	return DashboardHandler{
		SummaryService: &service.DashboardSummaryService{DB: db},
	}
}

func (h DashboardHandler) Summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.SummaryService.Get(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load dashboard summary")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": summary})
}
