package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/backup"
)

type BackupHandler struct {
	Service *backup.Service
}

func (h *BackupHandler) List(w http.ResponseWriter, r *http.Request) {
	backups, err := h.Service.ListBackups()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
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
		writeError(w, http.StatusForbidden, "hanya admin yang dapat membuat backup")
		return
	}
	filename, err := h.Service.CreateBackup(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
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
		writeError(w, http.StatusForbidden, "hanya admin yang dapat verifikasi backup")
		return
	}

	filename := chi.URLParam(r, "filename")
	if filename == "" {
		writeError(w, http.StatusBadRequest, "filename is required")
		return
	}

	result, err := h.Service.VerifyBackup(r.Context(), filename)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"data":  result,
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "backup verified successfully",
		"data":    result,
	})
}

func (h *BackupHandler) Download(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		writeError(w, http.StatusBadRequest, "filename is required")
		return
	}

	path, err := h.Service.GetBackupPath(filename)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}
