package handler

import (
	"net/http"

	"menettech/dashboard/backend/internal/config"
)

func WriteMeta(w http.ResponseWriter, cfg config.Config) {
	writeJSON(w, http.StatusOK, map[string]any{
		"name":        cfg.AppName,
		"environment": cfg.Environment,
		"version":     "0.1.0-dev",
		"stack": map[string]string{
			"backend":  "go",
			"frontend": "react",
			"database": "sqlite",
		},
	})
}
