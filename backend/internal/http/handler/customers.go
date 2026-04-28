package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/customers"
)

type CustomerHandler struct {
	Service customers.Service
}

type statusPayload struct {
	Status string `json:"status"`
}

func NewCustomerHandler(service customers.Service) CustomerHandler {
	return CustomerHandler{Service: service}
}

func (h CustomerHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load customers")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h CustomerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload customers.Customer
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer payload")
		return
	}

	item, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"data": item,
	})
}

func (h CustomerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload customers.Customer
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer payload")
		return
	}

	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			writeError(w, http.StatusNotFound, "customer not found")
			return
		}

		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h CustomerHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload statusPayload
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid status payload")
		return
	}

	if err := h.Service.UpdateStatus(r.Context(), id, payload.Status); err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			writeError(w, http.StatusNotFound, "customer not found")
			return
		}

		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "customer status updated",
	})
}
