package handler

import (
	"net/http"

	"menettech/dashboard/backend/internal/reports"
)

type ReportsHandler struct {
	Service reports.Service
}

func NewReportsHandler(service reports.Service) ReportsHandler {
	return ReportsHandler{Service: service}
}

func (h ReportsHandler) Revenue(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.MonthlyRevenue(r.Context(), 12)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get revenue report")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h ReportsHandler) Aging(w http.ResponseWriter, r *http.Request) {
	report, err := h.Service.Aging(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get aging report")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": report})
}
