package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/chatbot_forms"
)

type ChatbotFormHandler struct {
	Service chatbot_forms.Service
}

func NewChatbotFormHandler(service chatbot_forms.Service) ChatbotFormHandler {
	return ChatbotFormHandler{Service: service}
}

func (h ChatbotFormHandler) List(w http.ResponseWriter, r *http.Request) {
	formType := r.URL.Query().Get("type")
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}

	items, err := h.Service.List(r.Context(), formType, limit)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load chatbot forms: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"count":  len(items),
		"data":   items,
	})
}

func (h ChatbotFormHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload chatbot_forms.ChatbotForm
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid chatbot form payload")
		return
	}

	item, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"status":  "success",
		"message": "Data form berhasil ditambahkan",
		"data": map[string]any{
			"id": item.ID,
		},
	})
}

type patchFormPayload struct {
	Status string `json:"status"`
}

func (h ChatbotFormHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "invalid form id")
		return
	}

	var payload patchFormPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if payload.Status == "" {
		WriteError(w, http.StatusBadRequest, "status is required")
		return
	}

	item, err := h.Service.UpdateStatus(r.Context(), id, payload.Status)
	if err != nil {
		if errors.Is(err, chatbot_forms.ErrFormNotFound) {
			WriteError(w, http.StatusNotFound, "form not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to update status: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": "Status form diperbarui",
		"data":    item,
	})
}

func (h ChatbotFormHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "invalid form id")
		return
	}

	err := h.Service.Delete(r.Context(), id)
	if err != nil {
		if errors.Is(err, chatbot_forms.ErrFormNotFound) {
			WriteError(w, http.StatusNotFound, "form not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to delete form: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": "Data form berhasil dihapus",
	})
}
