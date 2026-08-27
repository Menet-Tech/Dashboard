package handler

import (
	"net/http"
	"strconv"

	"menettech/dashboard/backend/internal/audit"
)

type AuditHandler struct {
	Service audit.Service
}

func NewAuditHandler(service audit.Service) AuditHandler {
	return AuditHandler{Service: service}
}

func (h AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if user.Role != "admin" {
		WriteError(w, http.StatusForbidden, "hanya admin yang dapat melihat audit log")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.Service.List(r.Context(), limit)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load audit logs")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": items})
}
