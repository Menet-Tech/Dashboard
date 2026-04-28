package router

import (
	"database/sql"
	"log/slog"
	"net/http"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/backup"
	"menettech/dashboard/backend/internal/billing"
	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/packages"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
	"menettech/dashboard/backend/internal/users"
)

func New(cfg config.Config, logger *slog.Logger, db *sql.DB, authService auth.Service) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(15 * time.Second))
	r.Use(requestLogger(logger))

	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	auditService := audit.Service{Repository: audit.Repository{DB: db}}
	templateService := templates.Service{Repository: templates.Repository{DB: db}}
	whatsAppService := notifications.WhatsAppService{
		Settings:  settingsService,
		Templates: templateService,
		Logs:      notifications.NotificationLogRepository{DB: db},
	}

	authHandler := handler.NewAuthHandler(authService, auditService)
	healthHandler := handler.NewHealthHandler(cfg, logger, db, settingsService)
	dashboardHandler := handler.NewDashboardHandler(db)
	auditHandler := handler.NewAuditHandler(auditService)
	packageHandler := handler.NewPackageHandler(packages.Service{
		Repository: packages.Repository{DB: db},
	})
	userHandler := handler.NewUserHandler(users.Service{
		Repository: users.Repository{DB: db},
	})
	customerHandler := handler.NewCustomerHandler(customers.Service{
		Repository: customers.Repository{DB: db},
	})

	discordService := notifications.NewDiscordService(settingsService)

	billHandler := handler.NewBillHandler(billing.Service{
		Repository: billing.Repository{DB: db},
		Settings:   settingsService,
		WhatsApp:   whatsAppService,
		Discord:    discordService,
	}, cfg.AppName, cfg.StoragePath)
	templateHandler := handler.NewTemplateHandler(templateService)
	settingsHandler := handler.NewSettingsHandler(settingsService)
	notificationHandler := handler.NewNotificationHandler(notifications.NotificationLogRepository{DB: db})
	backupDir := filepath.Join(cfg.StoragePath, "backups")
	backupHandler := &handler.BackupHandler{Service: backup.NewService(db, backupDir)}

	r.Get("/health", healthHandler.Show)
	r.Get("/livez", healthHandler.Live)
	r.Get("/readyz", healthHandler.Ready)
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(cfg.StoragePath, "uploads")))))

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/auth/login", authHandler.Login)
		api.Get("/meta", func(w http.ResponseWriter, r *http.Request) {
			handler.WriteMeta(w, cfg)
		})

		api.Group(func(protected chi.Router) {
			protected.Use(authMiddleware(authService))
			protected.Use(csrfMiddleware(authService.SessionCookieName))
			protected.Use(auditMiddleware(auditService))
			protected.Get("/auth/me", authHandler.Me)
			protected.Post("/auth/logout", authHandler.Logout)
			protected.Get("/audit-logs", auditHandler.List)
			protected.Get("/dashboard/summary", dashboardHandler.Summary)
			protected.Get("/packages", packageHandler.List)
			protected.Post("/packages", packageHandler.Create)
			protected.Put("/packages/{id}", packageHandler.Update)
			protected.Delete("/packages/{id}", packageHandler.Delete)
			protected.Get("/users", userHandler.List)
			protected.Post("/users", userHandler.Create)
			protected.Put("/users/{id}", userHandler.Update)
			protected.Post("/users/{id}/reset-password", userHandler.ResetPassword)
			protected.Get("/customers", customerHandler.List)
			protected.Post("/customers", customerHandler.Create)
			protected.Put("/customers/{id}", customerHandler.Update)
			protected.Patch("/customers/{id}/status", customerHandler.UpdateStatus)
			protected.Get("/bills", billHandler.List)
			protected.Post("/bills/generate", billHandler.Generate)
			protected.Post("/bills/{id}/pay", billHandler.Pay)
			protected.Get("/bills/{id}/invoice", billHandler.Invoice)
			protected.Get("/bills/{id}/notifications", notificationHandler.ListByBill)
			protected.Post("/bills/{id}/proof", billHandler.UploadProof)
			protected.Get("/templates", templateHandler.List)
			protected.Post("/templates", templateHandler.Create)
			protected.Put("/templates/{id}", templateHandler.Update)
			protected.Delete("/templates/{id}", templateHandler.Delete)
			protected.Get("/settings", settingsHandler.Get)
			protected.Put("/settings", settingsHandler.Update)
			protected.Post("/backups", backupHandler.Create)
			protected.Get("/backups", backupHandler.List)
			protected.Post("/backups/{filename}/verify", backupHandler.Verify)
			protected.Get("/backups/{filename}/download", backupHandler.Download)
		})
	})

	return r
}
