package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/users"
)

type UserHandler struct {
	Service users.Service
}

func NewUserHandler(service users.Service) UserHandler {
	return UserHandler{Service: service}
}

func (h UserHandler) List(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat melihat user")
		return
	}
	items, err := h.Service.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat menambah user")
		return
	}
	var payload users.CreateInput
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid user payload")
		return
	}
	item, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": item})
}

func (h UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat mengubah user")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var payload users.UpdateInput
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid user payload")
		return
	}
	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, users.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": item})
}

func (h UserHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat reset password")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var payload users.ResetPasswordInput
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid reset password payload")
		return
	}
	if err := h.Service.ResetPassword(r.Context(), id, payload); err != nil {
		if errors.Is(err, users.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "password user berhasil direset"})
}
