package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/templates"
)

type EmailTemplateHandler struct {
	Service templates.Service
}

func NewEmailTemplateHandler(service templates.Service) EmailTemplateHandler {
	return EmailTemplateHandler{Service: service}
}

func (h EmailTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.ListEmailTemplates(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load email templates")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h EmailTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload templates.EmailTemplate
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid email template payload")
		return
	}
	if payload.Name == "" || payload.TriggerKey == "" || payload.Subject == "" || payload.Content == "" {
		WriteError(w, http.StatusBadRequest, "invalid email template payload details")
		return
	}
	item, err := h.Service.CreateEmailTemplate(r.Context(), payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"data": item})
}

func (h EmailTemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid email template id")
		return
	}
	var payload templates.EmailTemplate
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid email template payload")
		return
	}
	if payload.Name == "" || payload.TriggerKey == "" || payload.Subject == "" || payload.Content == "" {
		WriteError(w, http.StatusBadRequest, "invalid email template payload details")
		return
	}
	item, err := h.Service.UpdateEmailTemplate(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, templates.ErrEmailTemplateNotFound) {
			WriteError(w, http.StatusNotFound, "email template not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": item})
}

func (h EmailTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid email template id")
		return
	}
	if err := h.Service.DeleteEmailTemplate(r.Context(), id); err != nil {
		if errors.Is(err, templates.ErrEmailTemplateNotFound) {
			WriteError(w, http.StatusNotFound, "email template not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to delete email template")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"message": "email template deleted"})
}
