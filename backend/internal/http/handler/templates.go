package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/templates"
)

type TemplateHandler struct {
	Service templates.Service
}

func NewTemplateHandler(service templates.Service) TemplateHandler {
	return TemplateHandler{Service: service}
}

func (h TemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load templates")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h TemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload templates.Template
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid template payload")
		return
	}
	item, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": item})
}

func (h TemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid template id")
		return
	}
	var payload templates.Template
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid template payload")
		return
	}
	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, templates.ErrTemplateNotFound) {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": item})
}

func (h TemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid template id")
		return
	}
	if err := h.Service.Delete(r.Context(), id); err != nil {
		if errors.Is(err, templates.ErrTemplateNotFound) {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete template")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "template deleted"})
}
