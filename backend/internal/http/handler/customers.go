package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/settings"
)

type CustomerHandler struct {
	Service customers.Service
	Audit   audit.Service
}

type statusPayload struct {
	Status string `json:"status"`
}

func NewCustomerHandler(service customers.Service, auditService audit.Service) CustomerHandler {
	return CustomerHandler{Service: service, Audit: auditService}
}

func (h CustomerHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load customers")
		return
	}

	waNumber := strings.TrimSpace(r.URL.Query().Get("wa_number"))
	if waNumber != "" {
		cleanWA := func(s string) string {
			s = strings.TrimSpace(s)
			s = strings.ReplaceAll(s, "+", "")
			s = strings.ReplaceAll(s, "-", "")
			s = strings.ReplaceAll(s, " ", "")
			if strings.HasPrefix(s, "0") {
				s = "62" + s[1:]
			}
			return s
		}
		target := cleanWA(waNumber)

		filtered := []customers.Customer{}
		for _, item := range items {
			if cleanWA(item.WhatsApp) == target {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h CustomerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload customers.Customer
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer payload")
		return
	}

	if payload.Name == "" || payload.PackageID <= 0 || payload.DueDay < 1 || payload.DueDay > 31 {
		WriteError(w, http.StatusBadRequest, "invalid customer payload details")
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

func (h CustomerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload customers.Customer
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer payload")
		return
	}

	if payload.Name == "" || payload.PackageID <= 0 || payload.DueDay < 1 || payload.DueDay > 31 {
		WriteError(w, http.StatusBadRequest, "invalid customer payload details")
		return
	}

	item, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}

		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h CustomerHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload statusPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid status payload")
		return
	}

	if err := h.Service.UpdateStatus(r.Context(), id, payload.Status); err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}

		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "customer status updated",
	})
}

func (h CustomerHandler) FindByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}

		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": item,
	})
}

func (h CustomerHandler) ONTStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	if strings.TrimSpace(item.SNOnt) == "" {
		WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "unconfigured",
			"message": "ONT Serial Number is not configured for this customer",
		})
		return
	}

	acsURL, err := h.Service.Settings.GetString(r.Context(), settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSUsername)
	acsPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSPassword)

	client := acs.NewClient(acsURL, acsUser, acsPass)
	status, err := client.GetDeviceStatus(r.Context(), item.SNOnt)
	if err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to fetch ONT status from GenieACS: %v", err))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": status,
	})
}

func (h CustomerHandler) ONTReboot(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	if strings.TrimSpace(item.SNOnt) == "" {
		WriteError(w, http.StatusBadRequest, "ONT Serial Number is not configured for this customer")
		return
	}

	acsURL, err := h.Service.Settings.GetString(r.Context(), settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSUsername)
	acsPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSPassword)

	client := acs.NewClient(acsURL, acsUser, acsPass)
	err = client.RebootDevice(r.Context(), item.SNOnt)
	if err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to reboot ONT via GenieACS: %v", err))
		return
	}

	// Record the action in audit logs
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.reboot_ont", fmt.Sprintf("Reboot ONT pelanggan %s (SN: %s) berhasil", item.Name, item.SNOnt), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "Reboot command successfully sent to ONT",
	})
}

type wifiPayload struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
}

func (h CustomerHandler) ONTWifiUpdate(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	if strings.TrimSpace(item.SNOnt) == "" {
		WriteError(w, http.StatusBadRequest, "ONT Serial Number is not configured for this customer")
		return
	}

	var payload wifiPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	payload.SSID = strings.TrimSpace(payload.SSID)
	payload.Password = strings.TrimSpace(payload.Password)

	if payload.SSID == "" {
		WriteError(w, http.StatusBadRequest, "SSID tidak boleh kosong")
		return
	}
	if len(payload.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "Password WiFi minimal harus 8 karakter")
		return
	}

	acsURL, err := h.Service.Settings.GetString(r.Context(), settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSUsername)
	acsPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSPassword)

	client := acs.NewClient(acsURL, acsUser, acsPass)
	err = client.SetWifiConfig(r.Context(), item.SNOnt, payload.SSID, payload.Password)
	if err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to update WiFi config via GenieACS: %v", err))
		return
	}

	// Record the action in audit logs
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.wifi_update_ont", fmt.Sprintf("Ubah WiFi ONT pelanggan %s (SSID baru: %s) berhasil", item.Name, payload.SSID), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "WiFi configuration successfully pushed to ONT",
	})
}

func (h CustomerHandler) ONTFactoryReset(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	if strings.TrimSpace(item.SNOnt) == "" {
		WriteError(w, http.StatusBadRequest, "ONT Serial Number is not configured for this customer")
		return
	}

	acsURL, err := h.Service.Settings.GetString(r.Context(), settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSUsername)
	acsPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyACSPassword)

	client := acs.NewClient(acsURL, acsUser, acsPass)
	err = client.FactoryResetDevice(r.Context(), item.SNOnt)
	if err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to factory reset ONT via GenieACS: %v", err))
		return
	}

	// Record the action in audit logs
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.factory_reset_ont", fmt.Sprintf("Reset pabrik ONT pelanggan %s (SN: %s) berhasil", item.Name, item.SNOnt), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "Factory reset command successfully sent to ONT",
	})
}

func (h CustomerHandler) MikrotikKick(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	username := strings.TrimSpace(item.UserPPPoE)
	if username == "" {
		WriteError(w, http.StatusBadRequest, "PPPoE username is not configured for this customer")
		return
	}

	host, err := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikHost)
	if err != nil || host == "" {
		WriteError(w, http.StatusBadRequest, "MikroTik host is not configured in settings")
		return
	}
	mUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikUser)
	mPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikPass)

	client := mikrotik.NewClient(host, mUser, mPass)
	if err := client.Connect(r.Context()); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to connect to MikroTik: %v", err))
		return
	}
	defer client.Close()

	if err := client.KickUser(r.Context(), username); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("failed to terminate PPPoE session: %v", err))
		return
	}

	// Record the action in audit logs
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.kick_pppoe", fmt.Sprintf("Putus sesi PPPoE pelanggan %s (User: %s) berhasil", item.Name, username), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "PPPoE session successfully terminated",
	})
}

type referralActionPayload struct {
	Amount int `json:"amount"`
}

func (h CustomerHandler) WithdrawReferral(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	var payload referralActionPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	if payload.Amount <= 0 {
		WriteError(w, http.StatusBadRequest, "jumlah harus lebih besar dari 0")
		return
	}

	customer, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "pelanggan tidak ditemukan")
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	err = h.Service.WithdrawReferral(r.Context(), id, payload.Amount)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &customer.ID, "customer.referral_withdraw", fmt.Sprintf("Tarik tunai referral saldo pelanggan %s sebesar Rp %d berhasil", customer.Name, payload.Amount), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "berhasil melakukan penarikan tunai",
	})
}

func (h CustomerHandler) ConvertReferralToVoucher(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "id tidak valid")
		return
	}

	var payload referralActionPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	if payload.Amount <= 0 {
		WriteError(w, http.StatusBadRequest, "jumlah harus lebih besar dari 0")
		return
	}

	customer, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "pelanggan tidak ditemukan")
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	err = h.Service.ConvertReferralToVoucher(r.Context(), id, payload.Amount)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &customer.ID, "customer.referral_convert_voucher", fmt.Sprintf("Ubah saldo referral pelanggan %s sebesar Rp %d menjadi voucher diskon berhasil", customer.Name, payload.Amount), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "berhasil mengubah saldo menjadi voucher diskon",
	})
}


