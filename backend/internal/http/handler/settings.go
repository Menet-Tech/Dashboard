package handler

import (
	"net/http"
	"net/url"

	"menettech/dashboard/backend/internal/settings"
)

type SettingsHandler struct {
	Service settings.Service
}

func NewSettingsHandler(service settings.Service) SettingsHandler {
	return SettingsHandler{Service: service}
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

	for key, value := range payload {
		if (key == settings.KeyWAGatewayURL || key == settings.KeyDiscordWebhookURL) && value != "" {
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

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Pengaturan berhasil diperbarui"})
}
