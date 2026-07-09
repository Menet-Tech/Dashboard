package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/vouchers"
)

type VoucherHandler struct {
	Service vouchers.Service
	Audit   audit.Service
}

func NewVoucherHandler(service vouchers.Service) VoucherHandler {
	return VoucherHandler{Service: service}
}

func (h VoucherHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h VoucherHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload vouchers.Voucher
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload format")
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

func (h VoucherHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid voucher id")
		return
	}

	if err := h.Service.Delete(r.Context(), id); err != nil {
		if errors.Is(err, vouchers.ErrVoucherNotFound) {
			WriteError(w, http.StatusNotFound, "voucher not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "voucher.delete",
		fmt.Sprintf("Admin %s menghapus voucher ID %d", user.Username, id),
		getClientIP(r))

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "voucher deleted successfully",
	})
}

type claimPayload struct {
	Code string `json:"code"`
}

func (h VoucherHandler) Claim(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload claimPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload format")
		return
	}

	cv, err := h.Service.Claim(r.Context(), customerID, payload.Code)
	if err != nil {
		if errors.Is(err, vouchers.ErrVoucherNotFound) {
			WriteError(w, http.StatusNotFound, "Voucher code not found")
			return
		}
		if errors.Is(err, vouchers.ErrAlreadyHasActiveVoucher) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "voucher claimed successfully",
		"data":    cv,
	})
}

type toggleAutoApplyPayload struct {
	AutoApply bool `json:"auto_apply"`
}

func (h VoucherHandler) ToggleAutoApply(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload toggleAutoApplyPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload format")
		return
	}

	if err := h.Service.ToggleAutoApply(r.Context(), customerID, payload.AutoApply); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "auto apply preference updated",
	})
}

func (h VoucherHandler) ListUsageLogs(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.ListUsageLogs(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h VoucherHandler) ListCustomerVouchers(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.ListActiveCustomerVouchers(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}
