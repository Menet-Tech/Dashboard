package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/packages"
)

type PackageHandler struct {
	Service packages.Service
}

func NewPackageHandler(service packages.Service) PackageHandler {
	return PackageHandler{Service: service}
}

func (h PackageHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load packages")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h PackageHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload packages.Package
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid package payload")
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

func (h PackageHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid package id")
		return
	}

	var payload packages.Package
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid package payload")
		return
	}

	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, packages.ErrPackageNotFound) {
			writeError(w, http.StatusNotFound, "package not found")
			return
		}

		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h PackageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid package id")
		return
	}

	if err := h.Service.Delete(r.Context(), id); err != nil {
		switch {
		case errors.Is(err, packages.ErrPackageNotFound):
			writeError(w, http.StatusNotFound, "package not found")
		case errors.Is(err, packages.ErrPackageInUse):
			writeError(w, http.StatusConflict, "package masih dipakai pelanggan")
		default:
			writeError(w, http.StatusInternalServerError, "failed to delete package")
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "package deleted",
	})
}
