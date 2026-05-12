package router

import (
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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
	"menettech/dashboard/backend/internal/reports"
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
	reportsHandler := handler.NewReportsHandler(reports.Service{DB: db})

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

			// Admin only
			protected.Group(func(admin chi.Router) {
				admin.Use(requireRole("admin"))
				admin.Get("/audit-logs", auditHandler.List)
				admin.Post("/packages", packageHandler.Create)
				admin.Put("/packages/{id}", packageHandler.Update)
				admin.Delete("/packages/{id}", packageHandler.Delete)
				admin.Get("/users", userHandler.List)
				admin.Post("/users", userHandler.Create)
				admin.Put("/users/{id}", userHandler.Update)
				admin.Post("/users/{id}/reset-password", userHandler.ResetPassword)
				admin.Post("/templates", templateHandler.Create)
				admin.Put("/templates/{id}", templateHandler.Update)
				admin.Delete("/templates/{id}", templateHandler.Delete)
				admin.Get("/settings", settingsHandler.Get)
				admin.Put("/settings", settingsHandler.Update)
				admin.Post("/backups", backupHandler.Create)
				admin.Get("/backups", backupHandler.List)
				admin.Post("/backups/{filename}/verify", backupHandler.Verify)
				admin.Get("/backups/{filename}/download", backupHandler.Download)
				admin.Post("/backups/{filename}/restore", backupHandler.SimulateRestore)
				admin.Post("/backups/staging/apply", backupHandler.ApplyRestore)
			})

			// Admin + Petugas
			protected.Group(func(staff chi.Router) {
				staff.Use(requireRole("admin", "petugas"))
				staff.Post("/customers", customerHandler.Create)
				staff.Put("/customers/{id}", customerHandler.Update)
				staff.Patch("/customers/{id}/status", customerHandler.UpdateStatus)
				staff.Post("/bills/generate", billHandler.Generate)
				staff.Post("/bills/{id}/pay", billHandler.Pay)
				staff.Post("/bills/{id}/proof", billHandler.UploadProof)
			})

			// All logged in users (Admin, Petugas, Viewer)
			protected.Group(func(all chi.Router) {
				all.Use(requireRole("admin", "petugas", "viewer"))
				all.Get("/dashboard/summary", dashboardHandler.Summary)
				all.Get("/packages", packageHandler.List)
				all.Get("/customers", customerHandler.List)
				all.Get("/bills", billHandler.List)
				all.Get("/bills/{id}/invoice", billHandler.Invoice)
				all.Get("/bills/{id}/notifications", notificationHandler.ListByBill)
				all.Get("/templates", templateHandler.List)
				all.Get("/reports/revenue", reportsHandler.Revenue)
				all.Get("/reports/aging", reportsHandler.Aging)
			})
		})
	})

	// Serve static files from frontend/dist
	fs := http.FileServer(http.Dir(cfg.FrontendDistPath))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		path := strings.TrimPrefix(req.URL.Path, "/")
		if _, err := os.Stat(filepath.Join(cfg.FrontendDistPath, path)); os.IsNotExist(err) {
			http.ServeFile(w, req, filepath.Join(cfg.FrontendDistPath, "index.html"))
			return
		}
		fs.ServeHTTP(w, req)
	})

	return r
}
