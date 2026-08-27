package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/integration"
	"menettech/dashboard/backend/internal/settings"
)

type SettingsHandler struct {
	Service        settings.Service
	ServiceManager *integration.ServiceManager
}

func NewSettingsHandler(service settings.Service, serviceMgr *integration.ServiceManager) SettingsHandler {
	return SettingsHandler{
		Service:        service,
		ServiceManager: serviceMgr,
	}
}

func (h SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	data, err := h.Service.GetAll(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Gagal mengambil pengaturan")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (h SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "Sesi tidak valid")
		return
	}

	if user.Role != "admin" {
		WriteError(w, http.StatusForbidden, "Hanya admin yang dapat mengubah pengaturan")
		return
	}

	var payload map[string]string
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "Payload tidak valid")
		return
	}

	// Automate random API key generation if wa_gateway_enabled is "1" and API Key is empty or default
	enabledVal, ok := payload["wa_gateway_enabled"]
	if !ok {
		enabledVal, _ = h.Service.GetString(r.Context(), "wa_gateway_enabled")
	}
	if enabledVal == "1" {
		apiKeyVal, ok := payload["wa_api_key"]
		if !ok {
			apiKeyVal, _ = h.Service.GetString(r.Context(), "wa_api_key")
		}
		apiKeyVal = strings.TrimSpace(apiKeyVal)
		if apiKeyVal == "" || apiKeyVal == "change-me-secret" {
			payload["wa_api_key"] = generateRandomAPIKey()
		}
	}

	for key, value := range payload {
		if !settings.IsAllowedKey(key) {
			WriteError(w, http.StatusBadRequest, "Pengaturan tidak dikenal: "+key)
			return
		}
		if (key == "wa_gateway_url" || key == settings.KeyDiscordWebhookURL || key == settings.KeyACSURL) && value != "" {
			if _, err := url.ParseRequestURI(value); err != nil {
				WriteError(w, http.StatusBadRequest, "URL tidak valid untuk: "+key)
				return
			}
		}
		if err := h.Service.Set(r.Context(), key, value); err != nil {
			WriteError(w, http.StatusInternalServerError, "Gagal menyimpan pengaturan: "+key)
			return
		}
	}

	if h.ServiceManager != nil {
		go func() {
			_ = h.ServiceManager.Reconcile(context.Background())
		}()
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Pengaturan berhasil diperbarui"})
}

func (h SettingsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "Sesi tidak valid")
		return
	}

	if user.Role != "admin" {
		WriteError(w, http.StatusForbidden, "Hanya admin yang dapat menghapus pengaturan")
		return
	}

	key := chi.URLParam(r, "key")
	if key == "" {
		WriteError(w, http.StatusBadRequest, "Key wajib diisi")
		return
	}

	// Only allow deleting chatbot trigger settings to avoid deleting system-critical config rows
	if !strings.HasPrefix(key, "chatbot_trigger_") {
		WriteError(w, http.StatusBadRequest, "Hanya dapat menghapus chatbot triggers")
		return
	}

	if err := h.Service.Delete(r.Context(), key); err != nil {
		WriteError(w, http.StatusInternalServerError, "Gagal menghapus pengaturan: "+key)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Pengaturan berhasil dihapus"})
}

func generateRandomAPIKey() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "fallback-random-api-key-12345"
	}
	return hex.EncodeToString(bytes)
}
