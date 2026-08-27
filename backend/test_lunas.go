package main

import (
	"context"
	"database/sql"
	"log/slog"
	
	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
)

func main() {
	db, err := sql.Open("sqlite", "backend/storage/dashboard.db")
	if err != nil {
		panic(err)
	}

	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	templateService := templates.Service{Repository: templates.Repository{DB: db}}
	waService := notifications.WhatsAppService{
		Settings:  settingsService,
		Templates: templateService,
		Logs:      notifications.NotificationLogRepository{DB: db},
	}

	// Queue a lunas message manually
	ctx := context.Background()
	payload := notifications.BillMessagePayload{
		BillID:      1, // Assuming bill 1 exists
		TriggerKey:  "lunas",
		PhoneNumber: "08123456789",
		MessageData: map[string]string{
			"nama": "Test User",
		},
		Force: false, // isManual = false
	}
	
	slog.Info("Sending template...")
	err = waService.SendTemplate(ctx, payload)
	if err != nil {
		slog.Error("Failed", "error", err)
	} else {
		slog.Info("Success!")
	}
}
