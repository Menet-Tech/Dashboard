package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

type CustomerHandler struct {
	Service     customers.Service
	Audit       audit.Service
	StoragePath string
	WhatsApp    notifications.WhatsAppService
}

type statusPayload struct {
	Status string `json:"status"`
}

type bulkStatusPayload struct {
	IDs          []int64 `json:"ids"`
	Status       *string `json:"status,omitempty"`
	OdpID        *int64  `json:"odp_id,omitempty"`
	PackageID    *int64  `json:"paket_id,omitempty"`
	ReferredByID *int64  `json:"referred_by_id,omitempty"`
}

func NewCustomerHandler(service customers.Service, auditService audit.Service, storagePath string) CustomerHandler {
	return CustomerHandler{Service: service, Audit: auditService, StoragePath: storagePath}
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

	user, _ := currentUser(r)
	ip := getClientIP(r)
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.create", fmt.Sprintf("Pelanggan %s (PPPoE: %s, Paket: %s) berhasil dibuat", item.Name, item.UserPPPoE, item.PackageName), ip)

	if item.IsTrial && item.WhatsApp != "" && h.WhatsApp.Logs.DB != nil {
		go func(c customers.Customer) {
			bgCtx := context.Background()
			_ = h.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
				TriggerKey:  "trial_started",
				PhoneNumber: c.WhatsApp,
				MessageData: map[string]string{
					"nama":                c.Name,
					"hari_limit":          strconv.Itoa(c.TrialDays),
					"tanggal_akhir_trial": formatDateLabel(time.Now().AddDate(0, 0, c.TrialDays).Format("2006-01-02")),
				},
			})
		}(item)
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

	user, _ := currentUser(r)
	ip := getClientIP(r)
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &item.ID, "customer.update", fmt.Sprintf("Data pelanggan %s (PPPoE: %s) berhasil diperbarui", item.Name, item.UserPPPoE), ip)

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

	user, _ := currentUser(r)
	ip := getClientIP(r)
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "customer.update_status", fmt.Sprintf("Status pelanggan ID %d diubah menjadi %s", id, payload.Status), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "customer status updated",
	})
}

// UpdateOdp handles PATCH /api/v1/customers/{id}/odp
// It sets (or clears) the ODP and port assignment for a customer.
func (h CustomerHandler) UpdateOdp(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	var payload struct {
		OdpID   *int64 `json:"odp_id"`
		OdpPort *int   `json:"odp_port"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid odp payload")
		return
	}

	if err := h.Service.UpdateOdp(r.Context(), id, payload.OdpID, payload.OdpPort); err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "odp assignment updated"})
}

func (h CustomerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	// Fetch customer first for audit log before deleting
	cust, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}

	if err := h.Service.Delete(r.Context(), id); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "customer.delete", fmt.Sprintf("Hapus pelanggan %s dengan PPPoE %s sukses", cust.Name, cust.UserPPPoE), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "customer deleted successfully",
	})
}


func (h CustomerHandler) BulkUpdateStatus(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var payload bulkStatusPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bulk update payload")
		return
	}

	if len(payload.IDs) == 0 {
		WriteError(w, http.StatusBadRequest, "no customer ids provided")
		return
	}

	const maxBulkUpdate = 100
	if len(payload.IDs) > maxBulkUpdate {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("terlalu banyak ID: maksimum %d per request", maxBulkUpdate))
		return
	}

	// Validate status if provided
	if payload.Status != nil {
		status := strings.TrimSpace(*payload.Status)
		if status != "active" && status != "limit" && status != "inactive" {
			WriteError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}

	successCount := 0
	var updateErrors []string

	for _, id := range payload.IDs {
		cust, err := h.Service.FindByID(r.Context(), id)
		if err != nil {
			updateErrors = append(updateErrors, fmt.Sprintf("id %d: not found", id))
			continue
		}

		modified := false
		var auditChanges []string

		if payload.Status != nil {
			newStatus := strings.TrimSpace(*payload.Status)
			if cust.Status != newStatus {
				cust.Status = newStatus
				modified = true
				auditChanges = append(auditChanges, fmt.Sprintf("status: %s", newStatus))
			}
		}

		if payload.OdpID != nil {
			var newOdpID *int64
			if *payload.OdpID > 0 {
				newOdpID = payload.OdpID
			}
			// Compare OdpID
			if (cust.OdpID == nil && newOdpID != nil) || (cust.OdpID != nil && newOdpID == nil) || (cust.OdpID != nil && newOdpID != nil && *cust.OdpID != *newOdpID) {
				cust.OdpID = newOdpID
				modified = true
				if newOdpID != nil {
					auditChanges = append(auditChanges, fmt.Sprintf("odp_id: %d", *newOdpID))
				} else {
					auditChanges = append(auditChanges, "odp_id: dikosongkan")
				}
			}
		}

		if payload.PackageID != nil {
			newPkgID := *payload.PackageID
			if cust.PackageID != newPkgID {
				cust.PackageID = newPkgID
				modified = true
				auditChanges = append(auditChanges, fmt.Sprintf("paket_id: %d", newPkgID))
			}
		}

		if payload.ReferredByID != nil {
			var newRefID *int64
			if *payload.ReferredByID > 0 {
				newRefID = payload.ReferredByID
			}
			// Compare ReferredByID
			if (cust.ReferredByID == nil && newRefID != nil) || (cust.ReferredByID != nil && newRefID == nil) || (cust.ReferredByID != nil && newRefID != nil && *cust.ReferredByID != *newRefID) {
				cust.ReferredByID = newRefID
				modified = true
				if newRefID != nil {
					auditChanges = append(auditChanges, fmt.Sprintf("referred_by_id: %d", *newRefID))
				} else {
					auditChanges = append(auditChanges, "referred_by_id: dikosongkan")
				}
			}
		}

		if !modified {
			successCount++
			continue
		}

		_, err = h.Service.Update(r.Context(), id, cust)
		if err != nil {
			updateErrors = append(updateErrors, fmt.Sprintf("id %d (%s): %v", id, cust.Name, err))
			continue
		}

		changesStr := strings.Join(auditChanges, ", ")
		_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "customer.bulk_update", fmt.Sprintf("Ubah data pelanggan %s secara massal (%s) berhasil", cust.Name, changesStr), ip)
		successCount++
	}

	res := map[string]any{
		"message": fmt.Sprintf("Successfully updated %d customers", successCount),
		"success_count": successCount,
	}
	if len(updateErrors) > 0 {
		res["errors"] = updateErrors
	}

	WriteJSON(w, http.StatusOK, res)
}

type bulkDeletePayload struct {
	IDs []int64 `json:"ids"`
}

func (h CustomerHandler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var payload bulkDeletePayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bulk delete payload")
		return
	}

	if len(payload.IDs) == 0 {
		WriteError(w, http.StatusBadRequest, "no customer ids provided")
		return
	}

	const maxBulkDelete = 100
	if len(payload.IDs) > maxBulkDelete {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("terlalu banyak ID: maksimum %d per request", maxBulkDelete))
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}

	successCount := 0
	var deleteErrors []string

	for _, id := range payload.IDs {
		cust, err := h.Service.FindByID(r.Context(), id)
		if err != nil {
			deleteErrors = append(deleteErrors, fmt.Sprintf("id %d: not found", id))
			continue
		}

		if err := h.Service.Delete(r.Context(), id); err != nil {
			deleteErrors = append(deleteErrors, fmt.Sprintf("id %d (%s): %v", id, cust.Name, err))
			continue
		}

		_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "customer.bulk_delete", fmt.Sprintf("Hapus pelanggan %s dengan PPPoE %s secara massal sukses", cust.Name, cust.UserPPPoE), ip)
		successCount++
	}

	res := map[string]any{
		"message": fmt.Sprintf("Successfully deleted %d customers", successCount),
		"success_count": successCount,
	}
	if len(deleteErrors) > 0 {
		res["errors"] = deleteErrors
	}

	WriteJSON(w, http.StatusOK, res)
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

	// ─── MikroTik Integration lookup ───
	var mkSecret *mikrotik.PPPoESecret
	var mkActive *mikrotik.PPPActive

	pppoeUsername := strings.TrimSpace(status.PPPoEUsername)
	if pppoeUsername == "" {
		pppoeUsername = strings.TrimSpace(item.UserPPPoE)
	}

	if pppoeUsername != "" {
		routerSvc := mikrotik.NewRouterService(h.Service.Repository.DB)
		routers, err := routerSvc.ListActive(r.Context())
		if err == nil && len(routers) > 0 {
			// Query the active routers
			for _, router := range routers {
				c := mikrotik.NewClient(router.Host, router.Username, router.Password)
				if err := c.Connect(r.Context()); err == nil {
					secret, errSec := c.GetSecret(r.Context(), pppoeUsername)
					if errSec == nil && secret != nil {
						mkSecret = secret
					}
					active, errAct := c.GetActiveConnection(r.Context(), pppoeUsername)
					if errAct == nil && active != nil {
						mkActive = active
					}
					c.Close()
					if mkSecret != nil || mkActive != nil {
						break // Found on this router, stop querying others
					}
				}
			}
		} else {
			// Fallback to legacy single router if list is empty or fails
			host, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikHost)
			user, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikUser)
			pass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikPass)
			if strings.TrimSpace(host) != "" && strings.TrimSpace(user) != "" {
				c := mikrotik.NewClient(host, user, pass)
				if err := c.Connect(r.Context()); err == nil {
					secret, errSec := c.GetSecret(r.Context(), pppoeUsername)
					if errSec == nil && secret != nil {
						mkSecret = secret
					}
					active, errAct := c.GetActiveConnection(r.Context(), pppoeUsername)
					if errAct == nil && active != nil {
						mkActive = active
					}
					c.Close()
				}
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"id":               status.ID,
			"serial_number":    status.SerialNumber,
			"model":            status.Model,
			"status":           status.Status,
			"ip_address":       status.IPAddress,
			"uptime":           status.Uptime,
			"hardware_version": status.HardwareVersion,
			"software_version": status.SoftwareVersion,
			"rx_optical_power": status.RxOpticalPower,
			"tx_optical_power": status.TxOpticalPower,
			"last_inform_time": status.LastInformTime,
			"pppoe_username":   pppoeUsername,
			"customer": map[string]any{
				"id":         item.ID,
				"name":       item.Name,
				"user_pppoe": item.UserPPPoE,
				"sn_ont":     item.SNOnt,
				"whatsapp":   item.WhatsApp,
				"status":     item.Status,
				"address":    item.Address,
			},
			"mikrotik_secret":    mkSecret,
			"mikrotik_active":    mkActive,
		},
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

	// Build list of routers to try (prefer legacy single-router settings, then multi-router table)
	var routers []mikrotik.Router
	host, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikHost)
	mUser, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikUser)
	mPass, _ := h.Service.Settings.GetString(r.Context(), settings.KeyMikrotikPass)
	if strings.TrimSpace(host) != "" && strings.TrimSpace(mUser) != "" {
		routers = append(routers, mikrotik.Router{Name: "Router Utama", Host: host, Username: mUser, Password: mPass})
	}
	if h.Service.Repository.DB != nil {
		routerSvc := mikrotik.NewRouterService(h.Service.Repository.DB)
		if activeRouters, err := routerSvc.ListActive(r.Context()); err == nil {
			for _, ar := range activeRouters {
				duplicate := false
				for _, existing := range routers {
					if strings.EqualFold(existing.Host, ar.Host) {
						duplicate = true
						break
					}
				}
				if !duplicate {
					routers = append(routers, ar)
				}
			}
		}
	}

	if len(routers) == 0 {
		WriteError(w, http.StatusBadRequest, "MikroTik belum dikonfigurasi")
		return
	}

	kicked := false
	for _, router := range routers {
		client := mikrotik.NewClient(router.Host, router.Username, router.Password)
		if err := client.Connect(r.Context()); err != nil {
			continue
		}
		kickErr := client.KickUser(r.Context(), username)
		client.Close()
		if kickErr == nil {
			kicked = true
		}
	}
	if !kicked {
		WriteError(w, http.StatusBadGateway, "gagal memutus sesi PPPoE: tidak ada router yang dapat dijangkau atau sesi tidak ditemukan")
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
	Amount        int    `json:"amount"`
	Method        string `json:"method"`
	PaymentTarget string `json:"payment_target"`
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

	const fixedReferralAmount = 50000
	payload.Amount = fixedReferralAmount // always force 50k regardless of what was sent

	if payload.Method == "" {
		payload.Method = "cash"
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

	withdrawID, err := h.Service.WithdrawReferral(r.Context(), id, payload.Amount, payload.Method, payload.PaymentTarget)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &customer.ID, "customer.referral_withdraw", fmt.Sprintf("Tarik tunai referral (%s) saldo pelanggan %s sebesar Rp %d diajukan", payload.Method, customer.Name, payload.Amount), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "berhasil melakukan penarikan tunai",
		"id":      withdrawID,
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

	const fixedReferralAmount = 50000
	payload.Amount = fixedReferralAmount // always force 50k regardless of what was sent

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

func (h CustomerHandler) EndTrial(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid customer id")
		return
	}

	// Fetch customer first for audit log before ending trial
	cust, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, customers.ErrCustomerNotFound) {
			WriteError(w, http.StatusNotFound, "customer not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load customer")
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}

	if err := h.Service.EndTrial(r.Context(), id); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, &id, "customer.end_trial", fmt.Sprintf("Trial pelanggan %s berhasil diberhentikan secara manual", cust.Name), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "customer trial terminated successfully",
	})
}

func (h CustomerHandler) ListReferralWithdrawals(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	withdrawals, err := h.Service.ListReferralWithdrawals(r.Context(), status)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"data": withdrawals,
	})
}

func (h CustomerHandler) CompleteReferralWithdrawal(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request id")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("proof")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "proof file is required")
		return
	}
	defer file.Close()

	const maxUploadSize = 5 << 20 // 5 MB limit
	if header.Size > maxUploadSize {
		WriteError(w, http.StatusBadRequest, "file size exceeds limit of 5MB")
		return
	}

	proofPath, err := h.storeProofFile(file, header.Filename, maxUploadSize)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	notes := r.FormValue("notes")
	if err := h.Service.CompleteReferralWithdrawal(r.Context(), id, proofPath, notes); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, nil, "referral_withdraw.complete", fmt.Sprintf("Penarikan referral ID %d selesai diproses dengan bukti %s", id, proofPath), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":    "payout completed successfully",
		"proof_path": proofPath,
	})
}

func (h CustomerHandler) RejectReferralWithdrawal(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request id")
		return
	}

	var payload struct {
		Notes string `json:"notes"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if err := h.Service.RejectReferralWithdrawal(r.Context(), id, payload.Notes); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, nil, "referral_withdraw.reject", fmt.Sprintf("Penarikan referral ID %d ditolak. Alasan: %s", id, payload.Notes), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "payout request rejected successfully",
	})
}

func (h CustomerHandler) storeProofFile(source io.Reader, originalName string, maxSize int64) (string, error) {
	originalName = filepath.Base(originalName)

	data, err := io.ReadAll(io.LimitReader(source, maxSize+1))
	if err != nil {
		return "", err
	}
	if int64(len(data)) > maxSize {
		return "", errors.New("file size exceeds limit of 5MB")
	}

	directory := filepath.Join(h.StoragePath, "uploads", "payment-proofs")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", err
	}

	contentType := http.DetectContentType(data)
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(originalName)))
	if ext == "" || ext == ".bin" {
		if strings.Contains(contentType, "image/jpeg") || strings.Contains(contentType, "image/jpg") {
			ext = ".jpg"
		} else if strings.Contains(contentType, "image/png") {
			ext = ".png"
		} else if strings.Contains(contentType, "image/webp") {
			ext = ".webp"
		} else if strings.Contains(contentType, "application/pdf") {
			ext = ".pdf"
		} else {
			ext = ".jpg" // fallback
		}
	}

	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".pdf" && ext != ".webp" {
		return "", errors.New("file type is not allowed")
	}

	filename := fmt.Sprintf("ref_withdraw_%d%s", time.Now().UnixNano(), ext)
	targetPath := filepath.Join(directory, filename)

	absDir, err := filepath.Abs(directory)
	if err != nil {
		return "", fmt.Errorf("resolve uploads dir: %w", err)
	}
	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve target path: %w", err)
	}
	if !strings.HasPrefix(absTarget, absDir+string(filepath.Separator)) && absTarget != absDir {
		return "", fmt.Errorf("invalid path traversal attempt")
	}

	if err := os.WriteFile(targetPath, data, 0o644); err != nil {
		return "", err
	}

	return "/uploads/payment-proofs/" + filename, nil
}

func formatDateLabel(raw string) string {
	t, err := time.Parse("2006-01-02", raw)
	if err != nil {
		t, err = time.Parse("2006-01-02 15:04:05", raw)
		if err != nil {
			t, err = time.Parse(time.RFC3339, raw)
			if err != nil {
				return raw
			}
		}
	}
	months := [...]string{
		"Januari", "Februari", "Maret", "April", "Mei", "Juni",
		"Juli", "Agustus", "September", "Oktober", "November", "Desember",
	}
	return fmt.Sprintf("%d %s %d", t.Day(), months[t.Month()-1], t.Year())
}



