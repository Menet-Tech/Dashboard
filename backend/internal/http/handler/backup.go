package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/backup"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/notifications"
)

type BackupHandler struct {
	Service *backup.Service
	Discord notifications.DiscordSender
}

func (h *BackupHandler) List(w http.ResponseWriter, r *http.Request) {
	backups, err := h.Service.ListBackups()
	if err != nil {
		slog.Error("backup: failed to list backups", "error", err)
		WriteError(w, http.StatusInternalServerError, "gagal memuat daftar backup")
		return
	}

	if backups == nil {
		backups = []backup.BackupInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"data": backups})
}

func (h *BackupHandler) Create(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		WriteError(w, http.StatusForbidden, "hanya admin yang dapat membuat backup")
		return
	}

	ctx := r.Context()

	// 1. Create plain database-only backup locally
	filename, err := h.Service.CreateBackup(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 2. Fetch active MikroTik configurations
	mikrotikBackups := make(map[string][]byte)
	routerSvc := mikrotik.NewRouterService(h.Service.DB)
	routers, err := routerSvc.ListActive(ctx)
	if err == nil && len(routers) > 0 {
		for _, rt := range routers {
			client := mikrotik.NewClient(rt.Host, rt.Username, rt.Password)
			if data, err := client.ExportBackup(ctx); err == nil && len(data) > 0 {
				mikrotikBackups[rt.Name] = data
			}
		}
	}

	// 3. Build encrypted zip payload for Discord (both DB and Mikrotik encrypted inside)
	if h.Discord != nil && h.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
		zipBytes, err := h.Service.BuildDiscordBackupZip(ctx, filename, mikrotikBackups, "")
		if err == nil {
			timestamp := time.Now().Format("2006-01-02_15-04-05")
			zipFilename := fmt.Sprintf("backup_manual_%s.zip", timestamp)
			_ = h.Discord.SendFile(ctx, "✅ **Backup Manual Sukses!**\nDatabase Dashboard dan Konfigurasi MikroTik berhasil dicadangkan (Terenkripsi di dalam ZIP).", zipFilename, zipBytes)
		} else {
			// Log error but don't fail the API response
			slog.Warn("backup: failed to build discord backup zip", "error", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": "Backup created successfully",
		"data": map[string]string{
			"filename": filename,
		},
	})
}

func (h *BackupHandler) Verify(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		WriteError(w, http.StatusForbidden, "hanya admin yang dapat verifikasi backup")
		return
	}

	filename := chi.URLParam(r, "filename")
	if filename == "" {
		WriteError(w, http.StatusBadRequest, "filename is required")
		return
	}

	result, err := h.Service.VerifyBackup(r.Context(), filename)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]any{
			"data":  result,
			"error": err.Error(),
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "backup verified successfully",
		"data":    result,
	})
}

func (h *BackupHandler) Download(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if filename == "" {
		WriteError(w, http.StatusBadRequest, "filename is required")
		return
	}

	path, err := h.Service.GetBackupPath(filename)
	if err != nil {
		WriteError(w, http.StatusNotFound, "backup tidak ditemukan")
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}

func (h *BackupHandler) SimulateRestore(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		WriteError(w, http.StatusForbidden, "hanya admin yang dapat melakukan restore")
		return
	}

	filename := chi.URLParam(r, "filename")
	if filename == "" {
		WriteError(w, http.StatusBadRequest, "filename is required")
		return
	}

	result, err := h.Service.SimulateRestore(r.Context(), filename)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "simulation complete",
		"data":    result,
	})
}

func (h *BackupHandler) ApplyRestore(w http.ResponseWriter, r *http.Request) {
	if err := requireAdmin(r); err != nil {
		WriteError(w, http.StatusForbidden, "hanya admin yang dapat menerapkan restore")
		return
	}

	err := h.Service.ApplyRestore(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "Restore applied successfully. Application will restart now.",
	})

	// Gracefully trigger a restart by exiting (systemd will automatically restart the process)
	go func() {
		time.Sleep(1 * time.Second)
		os.Exit(0)
	}()
}

