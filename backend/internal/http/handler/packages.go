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
		WriteError(w, http.StatusInternalServerError, "failed to load packages")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h PackageHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload packages.Package
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid package payload")
		return
	}

	if payload.Name == "" || payload.SpeedMbps <= 0 || payload.Price < 0 {
		WriteError(w, http.StatusBadRequest, "invalid package payload details")
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

func (h PackageHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid package id")
		return
	}

	var payload packages.Package
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid package payload")
		return
	}

	if payload.Name == "" || payload.SpeedMbps <= 0 || payload.Price < 0 {
		WriteError(w, http.StatusBadRequest, "invalid package payload details")
		return
	}

	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, packages.ErrPackageNotFound) {
			WriteError(w, http.StatusNotFound, "package not found")
			return
		}

		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h PackageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid package id")
		return
	}

	deletePool := r.URL.Query().Get("delete_pool") == "true"

	if err := h.Service.Delete(r.Context(), id, deletePool); err != nil {
		switch {
		case errors.Is(err, packages.ErrPackageNotFound):
			WriteError(w, http.StatusNotFound, "package not found")
		case errors.Is(err, packages.ErrPackageInUse):
			WriteError(w, http.StatusConflict, "package masih dipakai pelanggan")
		default:
			WriteError(w, http.StatusInternalServerError, "failed to delete package")
		}
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "package deleted",
	})
}
