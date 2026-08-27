package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/inventory"
	"github.com/go-chi/chi/v5"
)

type InventoryHandler struct {
	Service inventory.Service
	Audit   audit.Service
}

func NewInventoryHandler(service inventory.Service, auditService audit.Service) *InventoryHandler {
	return &InventoryHandler{
		Service: service,
		Audit:   auditService,
	}
}

func (h *InventoryHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.ListItems(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"data": items})
}

func (h *InventoryHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input inventory.Item
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	created, err := h.Service.CreateItem(r.Context(), input)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.Record(r.Context(), &user.ID, nil, "INVENTORY_CREATE", "Menambahkan item inventaris: "+created.Name)

	WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": created})
}

func (h *InventoryHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input inventory.Item
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := h.Service.UpdateItem(r.Context(), id, input); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.Record(r.Context(), &user.ID, nil, "INVENTORY_UPDATE", "Memperbarui item inventaris: "+input.Name)

	input.ID = id
	WriteJSON(w, http.StatusOK, map[string]interface{}{"data": input})
}

func (h *InventoryHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	if err := h.Service.DeleteItem(r.Context(), id); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.Record(r.Context(), &user.ID, nil, "INVENTORY_DELETE", "Menghapus item inventaris")

	WriteJSON(w, http.StatusOK, map[string]interface{}{"message": "Item deleted"})
}

func (h *InventoryHandler) AddLog(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ID")
		return
	}

	var input inventory.Log
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	input.ItemID = id
	input.CreatedBy = user.Username

	if err := h.Service.AddLog(r.Context(), input); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	_ = h.Audit.Record(r.Context(), &user.ID, nil, "INVENTORY_LOG", "Menyesuaikan stok ("+input.Type+"): "+strconv.Itoa(input.Quantity))

	WriteJSON(w, http.StatusOK, map[string]interface{}{"message": "Log added successfully"})
}

func (h *InventoryHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	var itemIDPtr *int64
	if idStr := r.URL.Query().Get("item_id"); idStr != "" {
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err == nil {
			itemIDPtr = &id
		}
	}

	logs, err := h.Service.ListLogs(r.Context(), itemIDPtr)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"data": logs})
}
