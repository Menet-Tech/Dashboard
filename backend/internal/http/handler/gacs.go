package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/settings"
)

type GacsHandler struct {
	DB       *sql.DB
	Settings settings.Service
}

func NewGacsHandler(db *sql.DB, settingsService settings.Service) GacsHandler {
	return GacsHandler{
		DB:       db,
		Settings: settingsService,
	}
}

// getJWTSecret returns the secret key used for signing JWT tokens.
func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "fallback-secret-key-for-development-only"
	}
	return []byte(secret)
}

type GacsClaims struct {
	UserID   int64  `json:"userId,omitempty"`
	Username string `json:"username,omitempty"`
	Role     string `json:"role,omitempty"`
	Portal   bool   `json:"portal,omitempty"`
	APIKey   string `json:"apiKey,omitempty"`
	jwt.RegisteredClaims
}

func (h GacsHandler) getClient(r *http.Request) (*acs.Client, error) {
	acsURL := h.getSetting(r.Context(), "genieAcsUrl", "")
	if acsURL == "" {
		// Fallback to main settings KeyACSURL
		var err error
		acsURL, err = h.Settings.GetString(r.Context(), settings.KeyACSURL)
		if err != nil || acsURL == "" {
			acsURL = "http://localhost:7557"
		}
	}
	// Strip trailing /devices or /devices/ if present
	acsURL = strings.TrimSuffix(acsURL, "/")
	acsURL = strings.TrimSuffix(acsURL, "/devices")
	acsURL = strings.TrimSuffix(acsURL, "/")

	acsUser, _ := h.Settings.GetString(r.Context(), settings.KeyACSUsername)
	acsPass, _ := h.Settings.GetString(r.Context(), settings.KeyACSPassword)

	return acs.NewClient(acsURL, acsUser, acsPass), nil
}

func (h GacsHandler) getSetting(ctx context.Context, key string, defaultVal string) string {
	var val string
	err := h.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = ? LIMIT 1", key).Scan(&val)
	if err != nil || val == "" {
		return defaultVal
	}
	return val
}

func (h GacsHandler) setSetting(ctx context.Context, key, val string) error {
	var exists bool
	err := h.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM pengaturan WHERE key = ?)", key).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		_, err = h.DB.ExecContext(ctx, "UPDATE pengaturan SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?", val, key)
	} else {
		_, err = h.DB.ExecContext(ctx, "INSERT INTO pengaturan (key, value) VALUES (?, ?)", key, val)
	}
	return err
}

// GET /api/getdevice
func (h GacsHandler) GetDevices(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	devices, err := client.GetDevicesSummary(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, devices)
}

// GET /api/getdetaildevice/{id}
func (h GacsHandler) GetDetailedDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = chi.URLParam(r, "deviceId") // GACS compatibility
	}
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	res, err := client.GetDetailedDevice(r.Context(), h.DB, id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusNotFound, map[string]any{
				"error":     "Device not found",
				"deviceId":  id,
				"message":   "Device ID not found in GenieACS. Please verify the device ID is correct.",
			})
			return
		}
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// POST /api/summon-device
func (h GacsHandler) SummonDevice(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID string `json:"device_id"`
	}
	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"status":  "error",
			"alerts":  []map[string]string{{"type": "error", "message": "Device ID is required"}},
		})
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	categories := []string{"virtual", "wifi"}
	if err := client.SummonParameters(r.Context(), h.DB, payload.DeviceID, categories, ""); err != nil {
		WriteJSON(w, http.StatusBadGateway, map[string]any{
			"success": false,
			"status":  "error",
			"alerts":  []map[string]string{{"type": "error", "message": fmt.Sprintf("Error summoning device: %s", err.Error())}},
			"device_id": payload.DeviceID,
			"timestamp": time.Now().Format(time.RFC3339),
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"status":    "success",
		"alerts":    []map[string]string{{"type": "success", "message": "Successfully summoned parameters"}},
		"device_id": payload.DeviceID,
		"summoned":  14,
		"failed":    0,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

// POST /api/summon-detaildevice/{id}
func (h GacsHandler) SummonParameters(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = chi.URLParam(r, "deviceId")
	}
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	var payload struct {
		Parameters   []string `json:"parameters"`
		VendorPrefix string   `json:"detectedVendorPrefix"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		// Fallback defaults
		payload.Parameters = []string{"wifi", "wan", "virtual", "system", "hosts", "credentials"}
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	if err := client.SummonParameters(r.Context(), h.DB, id, payload.Parameters, payload.VendorPrefix); err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Immediate summoning tasks queued successfully",
		"deviceId": id,
		"parameterTypes": payload.Parameters,
	})
}

// POST /api/add-wan-ppp
// POST /api/gacs/devices/{id}/wan - dispatches to PPP or Bridge based on "type" field
func (h GacsHandler) CreateWANConnection(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "failed to read request body")
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	var peek struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(body, &peek)

	// Re-set the body for the downstream handler
	r.Body = io.NopCloser(bytes.NewReader(body))
	if strings.EqualFold(peek.Type, "bridge") {
		h.AddWanBridge(w, r)
	} else {
		h.AddWanPPP(w, r)
	}
}

func (h GacsHandler) AddWanPPP(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID      string          `json:"deviceId"`
		PppoeUsername string          `json:"pppoeUsername"`
		PppoePassword string          `json:"pppoePassword"`
		VlanID        int             `json:"vlanId"`
		Bindings      map[string]bool `json:"bindings"`
		BindingType   string          `json:"bindingType"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" {
		WriteError(w, http.StatusBadRequest, "invalid payload or missing deviceId")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	cfg := acs.WANConnectionConfig{
		Username:    payload.PppoeUsername,
		Password:    payload.PppoePassword,
		VlanID:      payload.VlanID,
		Bindings:    payload.Bindings,
		BindingType: payload.BindingType,
	}

	res, err := client.CreateWANConnection(r.Context(), h.DB, payload.DeviceID, "ppp", cfg)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// POST /api/add-wan-bridge
func (h GacsHandler) AddWanBridge(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID    string          `json:"deviceId"`
		VlanID      int             `json:"vlanId"`
		Bindings    map[string]bool `json:"bindings"`
		BindingType string          `json:"bindingType"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" {
		WriteError(w, http.StatusBadRequest, "invalid payload or missing deviceId")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	cfg := acs.WANConnectionConfig{
		VlanID:      payload.VlanID,
		Bindings:    payload.Bindings,
		BindingType: payload.BindingType,
	}

	res, err := client.CreateWANConnection(r.Context(), h.DB, payload.DeviceID, "bridge", cfg)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// POST /api/delete-wan/{deviceId} and legacy /api/delete-wan (with query params)
func (h GacsHandler) DeleteWANConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = chi.URLParam(r, "deviceId")
	}

	var payload struct {
		DeviceID   string `json:"deviceId"`
		ObjectPath string `json:"objectPath"`
		Name       string `json:"name"`
	}

	// Try reading body for GACS compat
	_ = decodeJSON(r, &payload)

	if id == "" {
		id = payload.DeviceID
	}
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	objectPath := r.URL.Query().Get("path")
	if objectPath == "" {
		objectPath = payload.ObjectPath
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		name = payload.Name
	}

	if objectPath == "" {
		WriteError(w, http.StatusBadRequest, "WAN path is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	res, err := client.DeleteWANConnection(r.Context(), h.DB, id, objectPath, name)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// POST /api/reboot-device
func (h GacsHandler) RebootDevice(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID string `json:"deviceId"`
	}
	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" {
		WriteError(w, http.StatusBadRequest, "deviceId is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	if err := client.RebootDeviceByID(r.Context(), payload.DeviceID); err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "Device reboot initiated successfully",
		"deviceId": payload.DeviceID,
	})
}

// DELETE /api/delete-device/{deviceId}
func (h GacsHandler) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = chi.URLParam(r, "deviceId")
	}
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	if err := client.DeleteDevice(r.Context(), id); err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"message":   "Device deleted successfully",
		"deviceId":  id,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

// GET /api/faults
func (h GacsHandler) GetFaults(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		// Mock response
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"data":    []any{},
			"total":   0,
		})
		return
	}

	faultsBaseURL := strings.Replace(baseURL, "/devices", "/faults", 1)
	if !strings.Contains(faultsBaseURL, "/faults") {
		faultsBaseURL = baseURL + "/faults"
	}

	reqURL := fmt.Sprintf("%s?projection=_id,device,channel,timestamp,code,message,retries,provisions", faultsBaseURL)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("GenieACS faults returned %d: %s", resp.StatusCode, string(body)))
		return
	}

	var faults []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&faults); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    faults,
		"total":   len(faults),
	})
}

// DELETE /api/faults/{faultId}
func (h GacsHandler) DeleteFault(w http.ResponseWriter, r *http.Request) {
	faultID := chi.URLParam(r, "faultId")
	if faultID == "" {
		WriteError(w, http.StatusBadRequest, "Fault ID is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "Fault deleted successfully (mock)",
			"faultId": faultID,
		})
		return
	}

	faultsBaseURL := strings.Replace(baseURL, "/devices", "/faults", 1)
	if !strings.Contains(faultsBaseURL, "/faults") {
		faultsBaseURL = baseURL + "/faults"
	}

	reqURL := fmt.Sprintf("%s/%s", faultsBaseURL, url.PathEscape(faultID))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodDelete, reqURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("GenieACS delete fault returned %d: %s", resp.StatusCode, string(body)))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Fault deleted successfully",
		"faultId": faultID,
	})
}

// DELETE /api/delete-faults/{deviceId}
func (h GacsHandler) DeleteDeviceFaults(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "deviceId")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"message":      "Successfully deleted faults (mock)",
			"deviceId":     id,
			"deletedCount": 0,
		})
		return
	}

	faultsBaseURL := strings.Replace(baseURL, "/devices", "/faults", 1)
	if !strings.Contains(faultsBaseURL, "/faults") {
		faultsBaseURL = baseURL + "/faults"
	}

	// 1. Fetch faults for device
	queryJSON := fmt.Sprintf(`{"device":"%s"}`, id)
	reqURL := fmt.Sprintf("%s?query=%s", faultsBaseURL, url.QueryEscape(queryJSON))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, string(body))
		return
	}

	var faults []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&faults); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 2. Delete each fault
	successCount := 0
	for _, f := range faults {
		fID, _ := f["_id"].(string)
		if fID == "" {
			continue
		}
		delURL := fmt.Sprintf("%s/%s", faultsBaseURL, url.PathEscape(fID))
		delReq, _ := http.NewRequestWithContext(r.Context(), http.MethodDelete, delURL, nil)
		if client.Username != "" {
			delReq.SetBasicAuth(client.Username, client.Password)
		}
		delResp, err := client.Client.Do(delReq)
		if err == nil {
			delResp.Body.Close()
			if delResp.StatusCode == http.StatusOK || delResp.StatusCode == http.StatusNoContent {
				successCount++
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"message":      fmt.Sprintf("Successfully deleted all %d faults for device %s", successCount, id),
		"deviceId":     id,
		"deletedCount": successCount,
	})
}

// POST /api/ssid-config/set-parameter etc
func (h GacsHandler) SetParameter(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID       string `json:"deviceId"`
		ParameterPath  string `json:"parameterPath"`
		ParameterValue any    `json:"parameterValue"`
		ParameterType  string `json:"parameterType"`
		BindingType    string `json:"bindingType"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" || payload.ParameterPath == "" || payload.ParameterValue == nil {
		WriteError(w, http.StatusBadRequest, "Missing required fields")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success":        true,
			"message":        "Parameter set successfully (mock)",
			"deviceId":       payload.DeviceID,
			"parameterPath":  payload.ParameterPath,
			"parameterValue": payload.ParameterValue,
		})
		return
	}

	// Huawei binding expansion if applicable
	var parameterValues [][]any
	if payload.BindingType == "" {
		payload.BindingType = "integer"
	}
	if payload.ParameterType == "" {
		payload.ParameterType = "xsd:string"
	}

	// Expand if Huawei style bindings object
	if m, ok := payload.ParameterValue.(map[string]any); ok {
		hasEnable := false
		for k := range m {
			if strings.HasSuffix(strings.ToLower(k), "enable") {
				hasEnable = true
				break
			}
		}
		if hasEnable {
			for k, v := range m {
				valBool, _ := v.(bool)
				if payload.BindingType == "boolean" {
					valStr := "false"
					if valBool {
						valStr = "true"
					}
					parameterValues = append(parameterValues, []any{payload.ParameterPath + "." + k, valStr, "xsd:boolean"})
				} else {
					valInt := 0
					if valBool {
						valInt = 1
					}
					parameterValues = append(parameterValues, []any{payload.ParameterPath + "." + k, valInt, "xsd:int"})
				}
			}
		}
	}

	if len(parameterValues) == 0 {
		parameterValues = [][]any{{payload.ParameterPath, payload.ParameterValue, payload.ParameterType}}
	}

	taskPayload := map[string]any{
		"name":            "setParameterValues",
		"parameterValues": parameterValues,
	}

	bodyBytes, _ := json.Marshal(taskPayload)
	reqURL := fmt.Sprintf("%s/%s/tasks?timeout=3000&connection_request", baseURL, url.PathEscape(payload.DeviceID))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, string(body))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":        true,
		"message":        "Parameter set successfully",
		"deviceId":       payload.DeviceID,
		"parameterPath":  payload.ParameterPath,
		"parameterValue": payload.ParameterValue,
	})
}

// POST /api/ssid-config/set-multiple-parameters etc
func (h GacsHandler) SetMultipleParameters(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID    string `json:"deviceId"`
		BindingType string `json:"bindingType"`
		Parameters  []struct {
			Path  string `json:"path"`
			Value any    `json:"value"`
			Type  string `json:"type"`
		} `json:"parameters"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" || len(payload.Parameters) == 0 {
		WriteError(w, http.StatusBadRequest, "Missing required fields")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success":         true,
			"message":         "Parameters set successfully (mock)",
			"deviceId":        payload.DeviceID,
			"parametersCount": len(payload.Parameters),
		})
		return
	}

	if payload.BindingType == "" {
		payload.BindingType = "integer"
	}

	var parameterValues [][]any
	for _, p := range payload.Parameters {
		pType := p.Type
		if pType == "" {
			pType = "xsd:string"
		}

		// Expand if Huawei style bindings object
		expanded := false
		if m, ok := p.Value.(map[string]any); ok {
			hasEnable := false
			for k := range m {
				if strings.HasSuffix(strings.ToLower(k), "enable") {
					hasEnable = true
					break
				}
			}
			if hasEnable {
				expanded = true
				for k, v := range m {
					valBool, _ := v.(bool)
					if payload.BindingType == "boolean" {
						valStr := "false"
						if valBool {
							valStr = "true"
						}
						parameterValues = append(parameterValues, []any{p.Path + "." + k, valStr, "xsd:boolean"})
					} else {
						valInt := 0
						if valBool {
							valInt = 1
						}
						parameterValues = append(parameterValues, []any{p.Path + "." + k, valInt, "xsd:int"})
					}
				}
			}
		}

		if !expanded {
			parameterValues = append(parameterValues, []any{p.Path, p.Value, pType})
		}
	}

	taskPayload := map[string]any{
		"name":            "setParameterValues",
		"parameterValues": parameterValues,
	}

	bodyBytes, _ := json.Marshal(taskPayload)
	reqURL := fmt.Sprintf("%s/%s/tasks?timeout=3000&connection_request", baseURL, url.PathEscape(payload.DeviceID))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, string(body))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":         true,
		"message":         "Parameters set successfully",
		"deviceId":        payload.DeviceID,
		"parametersCount": len(payload.Parameters),
	})
}

// POST /api/ssid-config/add-instance
func (h GacsHandler) AddSSIDInstance(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID string `json:"deviceId"`
	}
	if err := decodeJSON(r, &payload); err != nil || payload.DeviceID == "" {
		WriteError(w, http.StatusBadRequest, "deviceId is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	baseURL := strings.TrimSuffix(client.BaseURL, "/")
	if baseURL == "" || strings.Contains(strings.ToLower(baseURL), "mock") || strings.Contains(strings.ToLower(baseURL), "localhost") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "SSID instance added successfully (mock)",
			"deviceId": payload.DeviceID,
		})
		return
	}

	taskPayload := map[string]any{
		"name":       "addObject",
		"objectName": "InternetGatewayDevice.LANDevice.1.WLANConfiguration",
	}

	bodyBytes, _ := json.Marshal(taskPayload)
	reqURL := fmt.Sprintf("%s/%s/tasks?timeout=3000&connection_request", baseURL, url.PathEscape(payload.DeviceID))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		WriteError(w, http.StatusBadGateway, string(body))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "SSID instance added successfully. Please wait for device to sync.",
		"deviceId": payload.DeviceID,
	})
}

// GET /api/map-settings
func (h GacsHandler) GetMapSettings(w http.ResponseWriter, r *http.Request) {
	res, err := acs.GetMapSettings(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": res})
}

// PUT /api/map-settings
func (h GacsHandler) UpdateMapSettings(w http.ResponseWriter, r *http.Request) {
	var payload acs.MapSettings
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if payload.CenterLat == "" || payload.CenterLng == "" || payload.MaxZoomIn == "" || payload.MaxZoomOut == "" || payload.DefaultZoom == "" {
		WriteError(w, http.StatusBadRequest, "center_lat, center_lng, max_zoom_in, max_zoom_out, and default_zoom are required")
		return
	}

	err := acs.UpdateMapSettings(r.Context(), h.DB, &payload)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Refetch to return
	res, _ := acs.GetMapSettings(r.Context(), h.DB)
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Map settings saved successfully", "data": res})
}

// POST /api/map-settings/reset
func (h GacsHandler) ResetMapSettings(w http.ResponseWriter, r *http.Request) {
	res, err := acs.ResetMapSettings(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Map settings reset to defaults", "data": res})
}

// GET /api/mapping-data/nodes
func (h GacsHandler) GetNodes(w http.ResponseWriter, r *http.Request) {
	res, err := acs.GetNodes(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": res})
}

// GET /api/mapping-data/nodes/{nodeId}
func (h GacsHandler) GetNode(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "nodeId")
	if nodeID == "" {
		WriteError(w, http.StatusBadRequest, "Node ID is required")
		return
	}

	res, err := acs.GetNode(r.Context(), h.DB, nodeID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if res == nil {
		WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Node not found"})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": res})
}

// POST /api/mapping-data/nodes
func (h GacsHandler) CreateNode(w http.ResponseWriter, r *http.Request) {
	var payload acs.MappingNode
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if payload.NodeID == "" || payload.Type == "" || payload.Name == "" {
		WriteError(w, http.StatusBadRequest, "Required fields: node_id, type, name")
		return
	}

	validTypes := map[string]bool{"server": true, "odc": true, "odp": true, "ont": true}
	if !validTypes[payload.Type] {
		WriteError(w, http.StatusBadRequest, "Invalid type. Must be: server, odc, odp, or ont")
		return
	}

	err := acs.CreateNode(r.Context(), h.DB, &payload)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "message": "Node ID already exists"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "message": "Node created successfully", "data": payload})
}

// PUT /api/mapping-data/nodes/{nodeId}
func (h GacsHandler) UpdateNode(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "nodeId")
	if nodeID == "" {
		WriteError(w, http.StatusBadRequest, "Node ID is required")
		return
	}

	var payload acs.MappingNode
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err := acs.UpdateNode(r.Context(), h.DB, nodeID, &payload)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Node not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	res, _ := acs.GetNode(r.Context(), h.DB, nodeID)
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Node updated successfully", "data": res})
}

// DELETE /api/mapping-data/nodes/{nodeId}
func (h GacsHandler) DeleteNode(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "nodeId")
	if nodeID == "" {
		WriteError(w, http.StatusBadRequest, "Node ID is required")
		return
	}

	err := acs.DeleteNode(r.Context(), h.DB, nodeID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Node not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Node deleted successfully"})
}

// GET /api/mapping-data/edges
func (h GacsHandler) GetEdges(w http.ResponseWriter, r *http.Request) {
	res, err := acs.GetEdges(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": res})
}

// GET /api/mapping-data/edges/{edgeId}
func (h GacsHandler) GetEdge(w http.ResponseWriter, r *http.Request) {
	edgeID := chi.URLParam(r, "edgeId")
	if edgeID == "" {
		WriteError(w, http.StatusBadRequest, "Edge ID is required")
		return
	}

	res, err := acs.GetEdge(r.Context(), h.DB, edgeID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if res == nil {
		WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Edge not found"})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": res})
}

// POST /api/mapping-data/edges
func (h GacsHandler) CreateEdge(w http.ResponseWriter, r *http.Request) {
	var payload acs.MappingEdge
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if payload.EdgeID == "" || payload.Source == "" || payload.Target == "" {
		WriteError(w, http.StatusBadRequest, "Required fields: edge_id, source, target")
		return
	}

	err := acs.CreateEdge(r.Context(), h.DB, &payload)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "message": "Edge ID already exists"})
			return
		}
		if strings.Contains(err.Error(), "slots are full") || strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": err.Error()})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "message": "Edge created successfully", "data": payload})
}

// PUT /api/mapping-data/edges/{edgeId}
func (h GacsHandler) UpdateEdge(w http.ResponseWriter, r *http.Request) {
	edgeID := chi.URLParam(r, "edgeId")
	if edgeID == "" {
		WriteError(w, http.StatusBadRequest, "Edge ID is required")
		return
	}

	var payload acs.MappingEdge
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err := acs.UpdateEdge(r.Context(), h.DB, edgeID, &payload)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Edge not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	res, _ := acs.GetEdge(r.Context(), h.DB, edgeID)
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Edge updated successfully", "data": res})
}

// DELETE /api/mapping-data/edges/{edgeId}
func (h GacsHandler) DeleteEdge(w http.ResponseWriter, r *http.Request) {
	edgeID := chi.URLParam(r, "edgeId")
	if edgeID == "" {
		WriteError(w, http.StatusBadRequest, "Edge ID is required")
		return
	}

	err := acs.DeleteEdge(r.Context(), h.DB, edgeID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Edge not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Edge deleted successfully"})
}

// POST /api/mapping-data/sync
func (h GacsHandler) SyncMappingData(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Nodes []acs.MappingNode `json:"nodes"`
		Edges []acs.MappingEdge `json:"edges"`
	}

	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid JSON data format")
		return
	}

	err := acs.SyncMappingData(r.Context(), h.DB, payload.Nodes, payload.Edges)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Mapping data synchronized successfully",
		"summary": map[string]int{
			"nodes": len(payload.Nodes),
			"edges": len(payload.Edges),
		},
	})
}

// DELETE /api/mapping-data/reset
func (h GacsHandler) ResetMappingData(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Password string `json:"password"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.Password == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "Password is required"})
		return
	}

	// Verify password against first admin user
	var hashedPwd string
	err := h.DB.QueryRowContext(r.Context(), "SELECT password_hash FROM users WHERE role = 'admin' LIMIT 1").Scan(&hashedPwd)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "Failed to verify admin password"})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(hashedPwd), []byte(payload.Password)) != nil {
		// Use 400 Bad Request to prevent UI logouts on invalid password
		WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "Invalid password. Please try again."})
		return
	}

	err = acs.ResetMappingData(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "All mapping data has been deleted successfully"})
}

// GET /api/vendor-management/vendors
func (h GacsHandler) GetVendors(w http.ResponseWriter, r *http.Request) {
	vendors, err := acs.GetVendors(r.Context(), h.DB)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Map manufacturer_patterns and product_patterns from strings to slices (since we seeded as JSON arrays)
	type VendorOutput struct {
		ID                   int64    `json:"id"`
		Name                 string   `json:"name"`
		ManufacturerPatterns []string `json:"manufacturer_patterns"`
		ProductPatterns      []string `json:"product_patterns"`
		ParameterPrefix      string   `json:"parameter_prefix"`
		ServiceListPath      string   `json:"service_list_path"`
		LanBindingPath       string   `json:"lan_binding_path"`
		VlanIDPath           string   `json:"vlan_id_path"`
		HTTPWanEnablePath    string   `json:"http_wan_enable_path"`
		FirewallLevelPath    string   `json:"firewall_level_path"`
		Priority             int      `json:"priority"`
		Enabled              int      `json:"enabled"`
		Description          string   `json:"description"`
	}

	var output []VendorOutput
	for _, v := range vendors {
		output = append(output, VendorOutput{
			ID:                   v.ID,
			Name:                 v.Name,
			ManufacturerPatterns: v.ManufacturerPatterns,
			ProductPatterns:      v.ProductPatterns,
			ParameterPrefix:      v.ParameterPrefix,
			ServiceListPath:      v.ServiceListPath,
			LanBindingPath:       v.LanBindingPath,
			VlanIDPath:           v.VlanIDPath,
			HTTPWanEnablePath:    v.HTTPWanEnablePath,
			FirewallLevelPath:    v.FirewallLevelPath,
			Priority:             v.Priority,
			Enabled:              v.Enabled,
			Description:          v.Description,
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": output})
}

// POST /api/vendor-management/vendors
func (h GacsHandler) CreateVendor(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name                 string `json:"name"`
		ManufacturerPatterns any    `json:"manufacturer_patterns"` // slice or string
		ProductPatterns      any    `json:"product_patterns"`      // slice or string
		ParameterPrefix      string `json:"parameter_prefix"`
		ServiceListPath      string `json:"service_list_path"`
		LanBindingPath       string `json:"lan_binding_path"`
		VlanIDPath           string `json:"vlan_id_path"`
		HTTPWanEnablePath    string `json:"http_wan_enable_path"`
		FirewallLevelPath    string `json:"firewall_level_path"`
		Priority             int    `json:"priority"`
		Enabled              *int   `json:"enabled"`
		Description          string `json:"description"`
	}

	if err := decodeJSON(r, &payload); err != nil || payload.Name == "" {
		WriteError(w, http.StatusBadRequest, "Name is required")
		return
	}

	mfrJSON := "[]"
	if slice, ok := payload.ManufacturerPatterns.([]any); ok {
		b, _ := json.Marshal(slice)
		mfrJSON = string(b)
	} else if str, ok := payload.ManufacturerPatterns.(string); ok {
		var parts []string
		for _, s := range strings.Split(str, ",") {
			parts = append(parts, strings.TrimSpace(s))
		}
		b, _ := json.Marshal(parts)
		mfrJSON = string(b)
	}

	prodJSON := "[]"
	if slice, ok := payload.ProductPatterns.([]any); ok {
		b, _ := json.Marshal(slice)
		prodJSON = string(b)
	} else if str, ok := payload.ProductPatterns.(string); ok {
		var parts []string
		for _, s := range strings.Split(str, ",") {
			parts = append(parts, strings.TrimSpace(s))
		}
		b, _ := json.Marshal(parts)
		prodJSON = string(b)
	}

	prio := 10
	if payload.Priority > 0 {
		prio = payload.Priority
	}

	en := 1
	if payload.Enabled != nil {
		en = *payload.Enabled
	}

	res, err := h.DB.ExecContext(r.Context(), `
		INSERT INTO vendors (
			name, manufacturer_patterns, product_patterns, parameter_prefix,
			service_list_path, lan_binding_path, vlan_id_path,
			http_wan_enable_path, firewall_level_path, priority, enabled, description
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		payload.Name, mfrJSON, prodJSON, payload.ParameterPrefix,
		payload.ServiceListPath, payload.LanBindingPath, payload.VlanIDPath,
		payload.HTTPWanEnablePath, payload.FirewallLevelPath, prio, en, payload.Description,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	lastID, _ := res.LastInsertId()
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Vendor created successfully", "id": lastID})
}

// PUT /api/vendor-management/vendors/{id}
func (h GacsHandler) UpdateVendor(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid vendor ID")
		return
	}

	var payload struct {
		Name                 *string `json:"name"`
		ManufacturerPatterns any     `json:"manufacturer_patterns"`
		ProductPatterns      any     `json:"product_patterns"`
		ParameterPrefix      *string `json:"parameter_prefix"`
		ServiceListPath      *string `json:"service_list_path"`
		LanBindingPath       *string `json:"lan_binding_path"`
		VlanIDPath           *string `json:"vlan_id_path"`
		HTTPWanEnablePath    *string `json:"http_wan_enable_path"`
		FirewallLevelPath    *string `json:"firewall_level_path"`
		Priority             *int    `json:"priority"`
		Enabled              *int    `json:"enabled"`
		Description          *string `json:"description"`
	}

	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Retrieve existing vendor
	var v acs.Vendor
	var mfrRaw, prodRaw string
	err = h.DB.QueryRowContext(r.Context(), "SELECT name, manufacturer_patterns, product_patterns, parameter_prefix, service_list_path, lan_binding_path, vlan_id_path, http_wan_enable_path, firewall_level_path, priority, enabled, COALESCE(description,'') FROM vendors WHERE id = ?", id).Scan(
		&v.Name, &mfrRaw, &prodRaw, &v.ParameterPrefix, &v.ServiceListPath, &v.LanBindingPath, &v.VlanIDPath, &v.HTTPWanEnablePath, &v.FirewallLevelPath, &v.Priority, &v.Enabled, &v.Description,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Vendor not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = json.Unmarshal([]byte(mfrRaw), &v.ManufacturerPatterns)
	_ = json.Unmarshal([]byte(prodRaw), &v.ProductPatterns)

	if payload.Name != nil {
		v.Name = *payload.Name
	}
	if payload.ManufacturerPatterns != nil {
		if slice, ok := payload.ManufacturerPatterns.([]any); ok {
			var parts []string
			for _, item := range slice {
				if s, ok := item.(string); ok {
					parts = append(parts, s)
				}
			}
			v.ManufacturerPatterns = parts
		} else if str, ok := payload.ManufacturerPatterns.(string); ok {
			var parts []string
			for _, s := range strings.Split(str, ",") {
				parts = append(parts, strings.TrimSpace(s))
			}
			v.ManufacturerPatterns = parts
		}
	}
	if payload.ProductPatterns != nil {
		if slice, ok := payload.ProductPatterns.([]any); ok {
			var parts []string
			for _, item := range slice {
				if s, ok := item.(string); ok {
					parts = append(parts, s)
				}
			}
			v.ProductPatterns = parts
		} else if str, ok := payload.ProductPatterns.(string); ok {
			var parts []string
			for _, s := range strings.Split(str, ",") {
				parts = append(parts, strings.TrimSpace(s))
			}
			v.ProductPatterns = parts
		}
	}
	if payload.ParameterPrefix != nil {
		v.ParameterPrefix = *payload.ParameterPrefix
	}
	if payload.ServiceListPath != nil {
		v.ServiceListPath = *payload.ServiceListPath
	}
	if payload.LanBindingPath != nil {
		v.LanBindingPath = *payload.LanBindingPath
	}
	if payload.VlanIDPath != nil {
		v.VlanIDPath = *payload.VlanIDPath
	}
	if payload.HTTPWanEnablePath != nil {
		v.HTTPWanEnablePath = *payload.HTTPWanEnablePath
	}
	if payload.FirewallLevelPath != nil {
		v.FirewallLevelPath = *payload.FirewallLevelPath
	}
	if payload.Priority != nil {
		v.Priority = *payload.Priority
	}
	if payload.Enabled != nil {
		v.Enabled = *payload.Enabled
	}
	if payload.Description != nil {
		v.Description = *payload.Description
	}

	mfrJSON, _ := json.Marshal(v.ManufacturerPatterns)
	prodJSON, _ := json.Marshal(v.ProductPatterns)
	_, err = h.DB.ExecContext(r.Context(), `
		UPDATE vendors SET 
			name = ?, manufacturer_patterns = ?, product_patterns = ?, parameter_prefix = ?,
			service_list_path = ?, lan_binding_path = ?, vlan_id_path = ?,
			http_wan_enable_path = ?, firewall_level_path = ?, priority = ?, enabled = ?, description = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`,
		v.Name, string(mfrJSON), string(prodJSON), v.ParameterPrefix,
		v.ServiceListPath, v.LanBindingPath, v.VlanIDPath,
		v.HTTPWanEnablePath, v.FirewallLevelPath, v.Priority, v.Enabled, v.Description, id,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Vendor updated successfully"})
}

// DELETE /api/vendor-management/vendors/{id}
func (h GacsHandler) DeleteVendor(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid vendor ID")
		return
	}

	res, err := h.DB.ExecContext(r.Context(), "DELETE FROM vendors WHERE id = ?", id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "Vendor not found"})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Vendor deleted successfully"})
}

// satisfy GACS dead schema routes (sub-types, parameters, wifi-security)
func (h GacsHandler) GetSubTypes(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": []any{}})
}
func (h GacsHandler) GetParameters(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": []any{}})
}
func (h GacsHandler) GetWifiSecurity(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": []any{}})
}

// POST /api/devices/{id}/tags/{tag}
func (h GacsHandler) AddDeviceTag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag := chi.URLParam(r, "tag")
	if id == "" || tag == "" {
		WriteError(w, http.StatusBadRequest, "id and tag are required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	if err := client.AddDeviceTag(r.Context(), id, tag); err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Tag \"%s\" added to device %s", tag, id),
	})
}

// DELETE /api/devices/{id}/tags/{tag}
func (h GacsHandler) DeleteDeviceTag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag := chi.URLParam(r, "tag")
	if id == "" || tag == "" {
		WriteError(w, http.StatusBadRequest, "id and tag are required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	if err := client.DeleteDeviceTag(r.Context(), id, tag); err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Tag \"%s\" removed from device %s", tag, id),
	})
}

// GET /api/dashboard /api/dashboard/{widget}
func (h GacsHandler) GetDashboardData(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get ACS client")
		return
	}

	data, err := client.GetDashboardData(r.Context(), h.DB)
	if err != nil {
		// Fallback mock dashboard data in case of ACS errors
		mock := map[string]any{
			"metrics": []map[string]any{
				{"name": "Total Devices", "value": 0, "status": "down", "change": 0},
				{"name": "Online", "value": 0, "status": "down", "change": 0},
				{"name": "Offline", "value": 0, "status": "down", "change": 0},
				{"name": "Faults", "value": 0, "status": "down", "change": 0},
			},
			"connectionHistory": map[string]any{
				"labels": []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"},
				"series": []any{
					map[string]any{"name": "Connections", "data": []int{0, 0, 0, 0, 0, 0, 0}},
					map[string]any{"name": "Disconnections", "data": []int{0, 0, 0, 0, 0, 0, 0}},
				},
			},
			"connectionTypes": []any{},
			"connectionTypesChart": map[string]any{
				"labels": []string{"Unknown"},
				"series": []any{map[string]any{"name": "Devices", "data": []int{0}}},
				"colors": []string{"#4B72B0"},
			},
			"events":        []any{},
			"recentDevices": []any{},
			"rxPowerDistribution": map[string]any{
				"labels": []string{"Excellent", "Fair", "Poor", "N/A"},
				"series": []int{0, 0, 0, 0},
				"colors": []string{"#10B981", "#FBBF24", "#EF4444", "#9CA3AF"},
			},
		}
		WriteJSON(w, http.StatusOK, mock)
		return
	}

	// Router may route individual widgets here
	path := r.URL.Path
	if strings.HasSuffix(path, "/metrics") {
		WriteJSON(w, http.StatusOK, map[string]any{"metrics": data.Metrics})
		return
	} else if strings.HasSuffix(path, "/connection-history") {
		WriteJSON(w, http.StatusOK, data.ConnectionHistory)
		return
	} else if strings.HasSuffix(path, "/connection-types") {
		WriteJSON(w, http.StatusOK, map[string]any{
			"connectionTypes": data.ConnectionTypes,
			"chartData":       data.ConnectionTypesChart,
		})
		return
	} else if strings.HasSuffix(path, "/events") {
		WriteJSON(w, http.StatusOK, map[string]any{"events": data.Events})
		return
	} else if strings.HasSuffix(path, "/recent-devices") {
		WriteJSON(w, http.StatusOK, map[string]any{"recentDevices": data.RecentDevices})
		return
	} else if strings.HasSuffix(path, "/rxpower") {
		WriteJSON(w, http.StatusOK, data.RxPowerDistribution)
		return
	}

	WriteJSON(w, http.StatusOK, data)
}

// GET /api/public/app-name
func (h GacsHandler) GetPublicAppName(w http.ResponseWriter, r *http.Request) {
	name := h.getSetting(r.Context(), "appName", "GenieACS Panel")
	WriteJSON(w, http.StatusOK, map[string]any{
		"appName": name,
		"version": "1.7.0",
	})
}

// GET /api/docker/latest
func (h GacsHandler) GetDockerLatest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	repo := "solusidigitalnet/genieacspanelapi"
	reqURL := fmt.Sprintf("https://hub.docker.com/v2/repositories/%s/tags?page_size=100", repo)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("Docker Hub returned HTTP %d", resp.StatusCode))
		return
	}

	var payload struct {
		Results []struct {
			Name string `json:"name"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	extractVersion := func(tag string) string {
		re := regexp.MustCompile(`(\d+(?:\.\d+){0,2})`)
		m := re.FindStringSubmatch(tag)
		if len(m) > 1 {
			return m[1]
		}
		return ""
	}

	compareVersion := func(a, b string) int {
		if a == "" || b == "" {
			return 0
		}
		var pa, pb []int
		for _, part := range strings.Split(a, ".") {
			n, _ := strconv.Atoi(part)
			pa = append(pa, n)
		}
		for _, part := range strings.Split(b, ".") {
			n, _ := strconv.Atoi(part)
			pb = append(pb, n)
		}
		maxLen := len(pa)
		if len(pb) > maxLen {
			maxLen = len(pb)
		}
		for i := 0; i < maxLen; i++ {
			na, nb := 0, 0
			if i < len(pa) {
				na = pa[i]
			}
			if i < len(pb) {
				nb = pb[i]
			}
			if na > nb {
				return 1
			}
			if na < nb {
				return -1
			}
		}
		return 0
	}

	bestTag := ""
	bestVer := ""
	for _, res := range payload.Results {
		tag := res.Name
		ver := extractVersion(tag)
		if ver == "" {
			continue
		}
		if bestTag == "" || compareVersion(ver, bestVer) == 1 {
			bestTag = tag
			bestVer = ver
		}
	}

	if bestTag == "" {
		WriteJSON(w, http.StatusOK, map[string]any{"success": true, "latest": nil})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":          true,
		"latest":           bestTag,
		"latestNormalized": bestVer,
	})
}

// GET /api/settings
func (h GacsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.QueryContext(r.Context(), "SELECT key, value FROM pengaturan")
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	settingsObj := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			settingsObj[k] = v
		}
	}

	// Add default add_wan setting
	settingsObj["add_wan"] = "no"

	WriteJSON(w, http.StatusOK, settingsObj)
}

// GET /api/settings/{key}
func (h GacsHandler) GetSettingByKey(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if key == "" {
		WriteError(w, http.StatusBadRequest, "Setting key is required")
		return
	}

	var val string
	err := h.DB.QueryRowContext(r.Context(), "SELECT value FROM pengaturan WHERE key = ? LIMIT 1", key).Scan(&val)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteJSON(w, http.StatusNotFound, map[string]any{"message": "Setting not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{key: val})
}

// PUT /api/settings/{key}
func (h GacsHandler) UpdateSettingByKey(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if key == "" {
		WriteError(w, http.StatusBadRequest, "Setting key is required")
		return
	}

	var payload struct {
		Value string `json:"value"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "Value is required")
		return
	}

	err := h.setSetting(r.Context(), key, payload.Value)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{key: payload.Value})
}

// POST /api/settings/test-genieacs
func (h GacsHandler) TestGenieACSConnection(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		URL string `json:"url"`
	}
	if err := decodeJSON(r, &payload); err != nil || payload.URL == "" {
		WriteError(w, http.StatusBadRequest, "URL is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	testURL := strings.TrimSpace(payload.URL)
	testURL = strings.TrimSuffix(testURL, "/")
	testURL = fmt.Sprintf("%s/devices?limit=1", testURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, testURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		WriteJSON(w, http.StatusBadGateway, map[string]any{
			"success": false,
			"message": fmt.Sprintf("Failed to connect: %s", err.Error()),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		WriteJSON(w, http.StatusBadGateway, map[string]any{
			"success": false,
			"message": fmt.Sprintf("GenieACS server returned status %d", resp.StatusCode),
		})
		return
	}

	var data []any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "Connection successful, but unexpected response format",
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"message":     "Connection successful!",
		"deviceCount": len(data),
	})
}

// POST /api/auth/validate-api-key
func (h GacsHandler) ValidateAPIKey(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		APIKey string `json:"apiKey"`
	}
	if err := decodeJSON(r, &payload); err != nil || payload.APIKey == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"message": "API key is required"})
		return
	}

	var portalKey string
	err := h.DB.QueryRowContext(r.Context(), "SELECT value FROM pengaturan WHERE key = 'portalApiKey' LIMIT 1").Scan(&portalKey)
	if err != nil || portalKey != payload.APIKey {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Invalid API key"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, GacsClaims{
		Portal: true,
		APIKey: payload.APIKey,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
	})

	tokenStr, err := token.SignedString(getJWTSecret())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"token":   tokenStr,
		"message": "API key validated successfully",
	})
}

// POST /api/auth/login
func (h GacsHandler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Username == "" || req.Password == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"message": "Username and password are required"})
		return
	}

	var user struct {
		ID           int64
		Username     string
		PasswordHash string
		Role         string
		CreatedAt    string
		UpdatedAt    string
	}

	err := h.DB.QueryRowContext(r.Context(), "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = ?", req.Username).Scan(
		&user.ID, &user.Username, &user.PasswordHash, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Invalid username or password"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Invalid username or password"})
		return
	}

	// Generate access token (1h)
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, GacsClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
	})
	accessTokenStr, _ := accessToken.SignedString(getJWTSecret())

	// Generate refresh token (7d)
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, GacsClaims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	})
	refreshTokenStr, _ := refreshToken.SignedString(getJWTSecret())

	WriteJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id":        user.ID,
			"username":  user.Username,
			"role":      user.Role,
			"createdAt": user.CreatedAt,
			"updatedAt": user.UpdatedAt,
		},
		"token":        accessTokenStr,
		"refreshToken": refreshTokenStr,
	})
}

// GET /api/auth/user
func (h GacsHandler) AuthUser(w http.ResponseWriter, r *http.Request) {
	// User is added to context via gacsAuthMiddleware or standard session auth
	ctxUser, ok := authUserFromContext(r.Context())
	if !ok {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Unauthorized"})
		return
	}

	var user struct {
		ID        int64
		Username  string
		Role      string
		CreatedAt string
		UpdatedAt string
	}

	err := h.DB.QueryRowContext(r.Context(), "SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?", ctxUser.ID).Scan(
		&user.ID, &user.Username, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteJSON(w, http.StatusNotFound, map[string]any{"message": "User not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"id":        user.ID,
		"username":  user.Username,
		"role":      user.Role,
		"createdAt": user.CreatedAt,
		"updatedAt": user.UpdatedAt,
	})
}

// POST /api/auth/logout
func (h GacsHandler) AuthLogout(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"message": "Logout successful"})
}

// POST /api/auth/refresh
func (h GacsHandler) AuthRefresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decodeJSON(r, &req); err != nil || req.RefreshToken == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"message": "Refresh token is required"})
		return
	}

	token, err := jwt.ParseWithClaims(req.RefreshToken, &GacsClaims{}, func(token *jwt.Token) (any, error) {
		return getJWTSecret(), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			WriteJSON(w, http.StatusForbidden, map[string]any{"message": "Refresh token expired"})
			return
		}
		WriteJSON(w, http.StatusForbidden, map[string]any{"message": "Invalid refresh token"})
		return
	}

	claims, ok := token.Claims.(*GacsClaims)
	if !ok || !token.Valid {
		WriteJSON(w, http.StatusForbidden, map[string]any{"message": "Invalid refresh token"})
		return
	}

	var user struct {
		ID           int64
		Username     string
		PasswordHash string
		Role         string
		CreatedAt    string
		UpdatedAt    string
	}

	err = h.DB.QueryRowContext(r.Context(), "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE id = ?", claims.UserID).Scan(
		&user.ID, &user.Username, &user.PasswordHash, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteJSON(w, http.StatusNotFound, map[string]any{"message": "User not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Generate new access token
	newAccessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, GacsClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
	})
	newAccessTokenStr, _ := newAccessToken.SignedString(getJWTSecret())

	// Generate new refresh token
	newRefreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, GacsClaims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	})
	newRefreshTokenStr, _ := newRefreshToken.SignedString(getJWTSecret())

	WriteJSON(w, http.StatusOK, map[string]any{
		"token":        newAccessTokenStr,
		"refreshToken": newRefreshTokenStr,
	})
}

// POST /api/auth/change-username
func (h GacsHandler) AuthChangeUsername(w http.ResponseWriter, r *http.Request) {
	ctxUser, ok := authUserFromContext(r.Context())
	if !ok {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Unauthorized"})
		return
	}

	var req struct {
		CurrentUsername string `json:"currentUsername"`
		NewUsername     string `json:"newUsername"`
	}
	if err := decodeJSON(r, &req); err != nil || req.CurrentUsername == "" || req.NewUsername == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"message": "Current username and new username are required"})
		return
	}

	var user struct {
		ID       int64
		Username string
	}
	err := h.DB.QueryRowContext(r.Context(), "SELECT id, username FROM users WHERE id = ?", ctxUser.ID).Scan(&user.ID, &user.Username)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]any{"message": "Internal server error"})
		return
	}

	if user.Username != req.CurrentUsername {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Current username is incorrect"})
		return
	}

	// Check if new username exists
	var exists bool
	_ = h.DB.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? AND id != ?)", req.NewUsername, ctxUser.ID).Scan(&exists)
	if exists {
		WriteJSON(w, http.StatusConflict, map[string]any{"message": "Username already taken"})
		return
	}

	_, err = h.DB.ExecContext(r.Context(), "UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", req.NewUsername, ctxUser.ID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Username updated successfully"})
}

// POST /api/auth/change-password
func (h GacsHandler) AuthChangePassword(w http.ResponseWriter, r *http.Request) {
	ctxUser, ok := authUserFromContext(r.Context())
	if !ok {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Unauthorized"})
		return
	}

	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := decodeJSON(r, &req); err != nil || req.CurrentPassword == "" || req.NewPassword == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]any{"message": "Current password and new password are required"})
		return
	}

	var hashedPwd string
	err := h.DB.QueryRowContext(r.Context(), "SELECT password_hash FROM users WHERE id = ?", ctxUser.ID).Scan(&hashedPwd)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]any{"message": "Internal server error"})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(hashedPwd), []byte(req.CurrentPassword)) != nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]any{"message": "Current password is incorrect"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_, err = h.DB.ExecContext(r.Context(), "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", string(newHash), ctxUser.ID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Password updated successfully"})
}

// authUserFromContext retrieves basic user info from context if authenticated via gacsAuthMiddleware or main auth middleware.
func authUserFromContext(ctx context.Context) (struct {
	ID   int64
	Role string
}, bool) {
	// Check if custom claims exist in context (from gacsAuthMiddleware)
	if val := ctx.Value("gacs_user"); val != nil {
		if u, ok := val.(struct {
			ID   int64
			Role string
		}); ok {
			return u, true
		}
	}
	// Fallback to standard context User (if session cookie auth was used)
	if u, ok := auth.UserFromContext(ctx); ok {
		return struct {
			ID   int64
			Role string
		}{
			ID:   u.ID,
			Role: u.Role,
		}, true
	}
	return struct {
		ID   int64
		Role string
	}{}, false
}

// ─── CheckWAN ────────────────────────────────────────────────────────────────

// CheckWAN reads WAN service info from GenieACS for a given device ID.
// GET /api/check-wan/:deviceId  or  GET /api/v1/gacs/check-wan?deviceId=...
func (h GacsHandler) CheckWAN(w http.ResponseWriter, r *http.Request) {
	deviceID := chi.URLParam(r, "id")
	if deviceID == "" {
		deviceID = r.URL.Query().Get("deviceId")
	}
	if deviceID == "" {
		WriteError(w, http.StatusBadRequest, "deviceId is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.BaseURL == "" {
		WriteError(w, http.StatusBadRequest, "GenieACS URL not configured")
		return
	}

	// Build projection query for WAN data
	projection := "_id,_deviceId._ProductClass,_deviceId._SerialNumber,_deviceId._Manufacturer,_deviceId._OUI,InternetGatewayDevice.WANDevice"
	query := fmt.Sprintf(`{"_id":%q}`, deviceID)
	apiURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", client.BaseURL, url.QueryEscape(query), url.QueryEscape(projection))

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, apiURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}
	req.Header.Set("Accept-Encoding", "gzip")

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "GenieACS connection failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		WriteError(w, http.StatusBadGateway, "Invalid response from GenieACS")
		return
	}
	if len(devices) == 0 {
		WriteError(w, http.StatusNotFound, "Device not found in GenieACS")
		return
	}

	dev := devices[0]
	// Extract WAN device tree
	wanIPConns := []string{}
	wanPPPConns := []string{}
	availableSlots := map[string][]string{
		"wanIPConnections":  {},
		"wanPPPConnections": {},
	}

	if igd, ok := dev["InternetGatewayDevice"].(map[string]any); ok {
		if wanDevMap, ok := igd["WANDevice"].(map[string]any); ok {
			for wdIdx, wdVal := range wanDevMap {
				if wdIdx == "_object" || wdIdx == "_writable" || wdIdx == "_timestamp" {
					continue
				}
				wd, ok := wdVal.(map[string]any)
				if !ok {
					continue
				}
				connDevMap, ok := wd["WANConnectionDevice"].(map[string]any)
				if !ok {
					continue
				}
				usedConnDevs := []int{}
				for cdIdx, cdVal := range connDevMap {
					if cdIdx == "_object" || cdIdx == "_writable" || cdIdx == "_timestamp" {
						continue
					}
					cd, ok := cdVal.(map[string]any)
					if !ok {
						continue
					}
					ipIndices := []int{}
					pppIndices := []int{}

					if ipConnMap, ok := cd["WANIPConnection"].(map[string]any); ok {
						for ipIdx := range ipConnMap {
							if ipIdx == "_object" || ipIdx == "_writable" || ipIdx == "_timestamp" {
								continue
							}
							wanIPConns = append(wanIPConns, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANIPConnection.%s", wdIdx, cdIdx, ipIdx))
							if n, err2 := strconv.Atoi(ipIdx); err2 == nil {
								ipIndices = append(ipIndices, n)
							}
						}
					}
					if pppConnMap, ok := cd["WANPPPConnection"].(map[string]any); ok {
						for pppIdx := range pppConnMap {
							if pppIdx == "_object" || pppIdx == "_writable" || pppIdx == "_timestamp" {
								continue
							}
							wanPPPConns = append(wanPPPConns, fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.%s", wdIdx, cdIdx, pppIdx))
							if n, err2 := strconv.Atoi(pppIdx); err2 == nil {
								pppIndices = append(pppIndices, n)
							}
						}
					}
					if len(ipIndices) > 0 || len(pppIndices) > 0 {
						if n, err2 := strconv.Atoi(cdIdx); err2 == nil {
							usedConnDevs = append(usedConnDevs, n)
						}
					}
					// Next available PPP slot
					if len(pppIndices) > 0 {
						maxPPP := pppIndices[0]
						for _, v := range pppIndices {
							if v > maxPPP {
								maxPPP = v
							}
						}
						availableSlots["wanPPPConnections"] = append(availableSlots["wanPPPConnections"],
							fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.%d", wdIdx, cdIdx, maxPPP+1))
					} else if len(ipIndices) > 0 {
						availableSlots["wanPPPConnections"] = append(availableSlots["wanPPPConnections"],
							fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%s.WANPPPConnection.1", wdIdx, cdIdx))
					}
				}
				if len(usedConnDevs) > 0 {
					maxCD := usedConnDevs[0]
					for _, v := range usedConnDevs {
						if v > maxCD {
							maxCD = v
						}
					}
					availableSlots["wanPPPConnections"] = append(availableSlots["wanPPPConnections"],
						fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.%d.WANPPPConnection.1", wdIdx, maxCD+1))
				} else {
					availableSlots["wanPPPConnections"] = append(availableSlots["wanPPPConnections"],
						fmt.Sprintf("InternetGatewayDevice.WANDevice.%s.WANConnectionDevice.1.WANPPPConnection.1", wdIdx))
				}
			}
		}
	}

	devIdMap, _ := dev["_deviceId"].(map[string]any)
	productClass := ""
	manufacturer := ""
	if devIdMap != nil {
		if v, ok := devIdMap["_ProductClass"].(map[string]any); ok {
			if val, ok := v["_value"].(string); ok {
				productClass = val
			}
		}
		if v, ok := devIdMap["_Manufacturer"].(map[string]any); ok {
			if val, ok := v["_value"].(string); ok {
				manufacturer = val
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":         true,
		"deviceId":        deviceID,
		"productClass":    productClass,
		"manufacturer":    manufacturer,
		"wanIPConnections":  wanIPConns,
		"wanPPPConnections": wanPPPConns,
		"availableSlots":  availableSlots,
	})
}

// ─── CheckGponEpon ───────────────────────────────────────────────────────────

// CheckGponEpon detects GPON vs EPON mode from a device's WAN parameters.
// GET /api/check-gponepon/:deviceId  or  GET /api/v1/gacs/check-gponepon?deviceId=...
func (h GacsHandler) CheckGponEpon(w http.ResponseWriter, r *http.Request) {
	deviceID := chi.URLParam(r, "id")
	if deviceID == "" {
		deviceID = r.URL.Query().Get("deviceId")
	}
	if deviceID == "" {
		WriteError(w, http.StatusBadRequest, "deviceId is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.BaseURL == "" {
		WriteError(w, http.StatusBadRequest, "GenieACS URL not configured")
		return
	}

	projection := "_id,_deviceId._ProductClass,_deviceId._Manufacturer,InternetGatewayDevice.WANDevice"
	query := fmt.Sprintf(`{"_id":%q}`, deviceID)
	apiURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", client.BaseURL, url.QueryEscape(query), url.QueryEscape(projection))

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, apiURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.Username != "" {
		req.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(req)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "GenieACS connection failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil || len(devices) == 0 {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	dev := devices[0]
	mode := "UNKNOWN"

	// Walk WANDevice tree looking for X_CT-COM_WANEponLinkConfig / X_CT-COM_WANGponLinkConfig
	if igd, ok := dev["InternetGatewayDevice"].(map[string]any); ok {
		if wanDevMap, ok := igd["WANDevice"].(map[string]any); ok {
		outer:
			for wdIdx, wdVal := range wanDevMap {
				if wdIdx == "_object" || wdIdx == "_writable" || wdIdx == "_timestamp" {
					continue
				}
				wd, ok := wdVal.(map[string]any)
				if !ok {
					continue
				}
				connDevMap, ok := wd["WANConnectionDevice"].(map[string]any)
				if !ok {
					continue
				}
				for cdIdx, cdVal := range connDevMap {
					if cdIdx == "_object" || cdIdx == "_writable" || cdIdx == "_timestamp" {
						continue
					}
					cd, ok := cdVal.(map[string]any)
					if !ok {
						continue
					}
					if _, has := cd["X_CT-COM_WANEponLinkConfig"]; has {
						mode = "EPON"
						break outer
					}
					if _, has := cd["X_CT-COM_WANGponLinkConfig"]; has {
						mode = "GPON"
						break outer
					}
				}
			}
		}
	}

	devIdMap, _ := dev["_deviceId"].(map[string]any)
	productClass := ""
	manufacturer := ""
	if devIdMap != nil {
		if v, ok := devIdMap["_ProductClass"].(map[string]any); ok {
			productClass, _ = v["_value"].(string)
		}
		if v, ok := devIdMap["_Manufacturer"].(map[string]any); ok {
			manufacturer, _ = v["_value"].(string)
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"deviceId":     deviceID,
		"productClass": productClass,
		"manufacturer": manufacturer,
		"mode":         mode,
	})
}

// ─── Telegram Bot Settings ───────────────────────────────────────────────────

type TelegramBotSettings struct {
	BotToken string `json:"botToken"`
	ChatIDs  string `json:"chatIds"`
	Enabled  bool   `json:"enabled"`
}

// GetTelegramBotSettings reads Telegram bot config from the settings table.
func (h GacsHandler) GetTelegramBotSettings(w http.ResponseWriter, r *http.Request) {
	keys := []string{"telegramBotToken", "telegramChatIds", "telegramBotEnabled"}
	rows, err := h.DB.QueryContext(r.Context(), "SELECT key, value FROM pengaturan WHERE key IN (?, ?, ?)", keys[0], keys[1], keys[2])
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := TelegramBotSettings{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		switch k {
		case "telegramBotToken":
			result.BotToken = v
		case "telegramChatIds":
			result.ChatIDs = v
		case "telegramBotEnabled":
			result.Enabled = v == "true"
		}
	}
	WriteJSON(w, http.StatusOK, result)
}

// SaveTelegramBotSettings upserts Telegram bot config to the settings table.
func (h GacsHandler) SaveTelegramBotSettings(w http.ResponseWriter, r *http.Request) {
	var req TelegramBotSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	enabledStr := "false"
	if req.Enabled {
		enabledStr = "true"
	}

	if err := h.setSetting(r.Context(), "telegramBotToken", req.BotToken); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.setSetting(r.Context(), "telegramChatIds", req.ChatIDs); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.setSetting(r.Context(), "telegramBotEnabled", enabledStr); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Telegram bot settings saved"})
}

// ─── Portal ──────────────────────────────────────────────────────────────────

// PortalValidateAccessCode checks if a portal access code corresponds to a GenieACS device tag.
func (h GacsHandler) PortalValidateAccessCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AccessCode string `json:"accesscode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AccessCode == "" {
		WriteError(w, http.StatusBadRequest, "accesscode is required")
		return
	}

	client, err := h.getClient(r)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.BaseURL == "" {
		WriteError(w, http.StatusBadRequest, "GenieACS URL not configured")
		return
	}

	tag := fmt.Sprintf("portal:%s", req.AccessCode)
	query := fmt.Sprintf(`{"_tags":%q}`, tag)
	projection := "_id,_deviceId._ProductClass,_deviceId._SerialNumber,_tags,_lastInform"
	apiURL := fmt.Sprintf("%s/devices?query=%s&projection=%s", client.BaseURL, url.QueryEscape(query), url.QueryEscape(projection))

	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, apiURL, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if client.Username != "" {
		httpReq.SetBasicAuth(client.Username, client.Password)
	}

	resp, err := client.Client.Do(httpReq)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "GenieACS connection failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var devices []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&devices); err != nil {
		WriteError(w, http.StatusBadGateway, "Invalid response from GenieACS")
		return
	}
	if len(devices) == 0 {
		WriteError(w, http.StatusNotFound, "No device found for this access code")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"device":  devices[0],
	})
}

