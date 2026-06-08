package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/odp"
)

type OdpHandler struct {
	Service odp.Service
}

func NewOdpHandler(service odp.Service) OdpHandler {
	return OdpHandler{Service: service}
}

func (h OdpHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load odps")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h OdpHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload odp.Odp
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid odp payload")
		return
	}

	item, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"data": item,
	})
}

func (h OdpHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid odp id")
		return
	}

	var payload odp.Odp
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid odp payload")
		return
	}

	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, odp.ErrOdpNotFound) {
			WriteError(w, http.StatusNotFound, "odp not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h OdpHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid odp id")
		return
	}

	if err := h.Service.Delete(r.Context(), id); err != nil {
		switch {
		case errors.Is(err, odp.ErrOdpNotFound):
			WriteError(w, http.StatusNotFound, "odp not found")
		case errors.Is(err, odp.ErrOdpInUse):
			WriteError(w, http.StatusConflict, "odp masih digunakan pelanggan")
		default:
			WriteError(w, http.StatusInternalServerError, "failed to delete odp")
		}
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "odp deleted",
	})
}
