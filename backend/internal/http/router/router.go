package router

import (
	"context"
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
	"menettech/dashboard/backend/internal/broadcast"
	"menettech/dashboard/backend/internal/chatbot_forms"
	"menettech/dashboard/backend/internal/config"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/http/handler"
	"menettech/dashboard/backend/internal/integration"
	"menettech/dashboard/backend/internal/inventory"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/odp"
	"menettech/dashboard/backend/internal/packages"
	"menettech/dashboard/backend/internal/reports"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
	"menettech/dashboard/backend/internal/tickets"
	"menettech/dashboard/backend/internal/users"
	"menettech/dashboard/backend/internal/vouchers"
)

func New(cfg config.Config, logger *slog.Logger, db *sql.DB, authService auth.Service, serviceMgr *integration.ServiceManager) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(traceIDHeader)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(15 * time.Second))
	r.Use(requestLogger(logger))

	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	discordService := notifications.NewDiscordService(settingsService)
	auditService := audit.Service{
		Repository: audit.Repository{DB: db},
		Discord:    discordService,
	}
	templateService := templates.Service{Repository: templates.Repository{DB: db}}
	whatsAppService := notifications.WhatsAppService{
		Settings:  settingsService,
		Templates: templateService,
		Logs:      notifications.NotificationLogRepository{DB: db},
		Discord:   discordService,
	}

	authHandler := handler.NewAuthHandler(authService, auditService)
	healthHandler := handler.NewHealthHandler(cfg, logger, db, settingsService)
	dashboardHandler := handler.NewDashboardHandler(db)

	routerSvc := mikrotik.NewRouterService(db)
	poller := mikrotik.NewTrafficPoller(routerSvc)
	go poller.Start(context.Background(), 3*time.Second)
	mikrotikHandler := handler.NewMikrotikHandler(routerSvc, poller)

	auditHandler := handler.NewAuditHandler(auditService)
	packageHandler := handler.NewPackageHandler(packages.Service{
		Repository: packages.Repository{DB: db},
	})
	userHandler := handler.NewUserHandler(users.Service{
		Repository: users.Repository{DB: db},
	})
	customerHandler := handler.NewCustomerHandler(customers.Service{
		Repository: customers.Repository{DB: db},
		Settings:   settingsService,
	}, auditService, cfg.StoragePath)
	customerHandler.WhatsApp = whatsAppService
	odpHandler := handler.NewOdpHandler(odp.Service{
		Repository: odp.Repository{DB: db},
	})
	gacsHandler := handler.NewGacsHandler(db, settingsService)
	reportsHandler := handler.NewReportsHandler(reports.Service{DB: db})

	customersService := customers.Service{
		Repository: customers.Repository{DB: db},
		Settings:   settingsService,
	}

	billHandler := handler.NewBillHandler(billing.Service{
		Repository:    billing.Repository{DB: db},
		Settings:      settingsService,
		Customers:     customersService,
		WhatsApp:      whatsAppService,
		Discord:       discordService,
		Notifications: notifications.NotificationLogRepository{DB: db},
		Templates:     templateService,
	}, cfg.AppName, cfg.StoragePath, auditService)
	customerHandler.Billing = billing.Service{
		Repository:    billing.Repository{DB: db},
		Settings:      settingsService,
		Customers:     customersService,
		WhatsApp:      whatsAppService,
		Discord:       discordService,
		Notifications: notifications.NotificationLogRepository{DB: db},
		Templates:     templateService,
	}
	customerHandler.Settings = settingsService
	templateHandler := handler.NewTemplateHandler(templateService)
	emailTemplateHandler := handler.NewEmailTemplateHandler(templateService)
	settingsHandler := handler.NewSettingsHandler(settingsService, serviceMgr)
	notificationHandler := handler.NewNotificationHandler(notifications.NotificationLogRepository{DB: db})
	backupDir := filepath.Join(cfg.StoragePath, "backups")
	backupHandler := &handler.BackupHandler{
		Service: backup.NewService(db, backupDir, cfg.SQLitePath),
		Discord: discordService,
	}
	integrationHandler := handler.NewIntegrationHandler(settingsService, whatsAppService, discordService)
	integrationHandler.Customers = customers.Service{
		Repository: customers.Repository{DB: db},
		Settings:   settingsService,
	}
	integrationHandler.Packages = packages.Service{
		Repository: packages.Repository{DB: db},
	}
	integrationHandler.Routers = routerSvc

	ticketsService := tickets.Service{
		Repository: tickets.Repository{DB: db},
		WhatsApp:   whatsAppService,
	}
	ticketHandler := handler.NewTicketHandler(ticketsService)

	broadcastService := broadcast.Service{
		DB:       db,
		WhatsApp: whatsAppService,
	}
	broadcastHandler := handler.NewBroadcastHandler(broadcastService)

	chatbotFormHandler := handler.NewChatbotFormHandler(chatbot_forms.Service{
		Repository: chatbot_forms.Repository{DB: db},
	})

	voucherService := vouchers.Service{
		Repository: vouchers.Repository{DB: db},
	}
	voucherHandler := handler.NewVoucherHandler(voucherService)
	voucherHandler.Audit = auditService

	inventoryService := inventory.Service{
		Repository: inventory.Repository{DB: db},
	}
	inventoryHandler := handler.NewInventoryHandler(inventoryService, auditService)

	r.Get("/health", healthHandler.Show)
	r.Get("/livez", healthHandler.Live)
	r.Get("/readyz", healthHandler.Ready)
	uploadsFileServer := http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(cfg.StoragePath, "uploads"))))
	r.Handle("/uploads/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		uploadsFileServer.ServeHTTP(w, r)
	}))

	r.Route("/api", func(api chi.Router) {
		// Public routes
		api.Get("/public/app-name", gacsHandler.GetPublicAppName)
		api.Get("/docker/latest", gacsHandler.GetDockerLatest)
		api.Post("/auth/validate-api-key", gacsHandler.ValidateAPIKey)
		api.Post("/auth/login", gacsHandler.AuthLogin)
		api.Post("/auth/refresh", gacsHandler.AuthRefresh)

		// Protected GACS routes using gacsAuthMiddleware
		api.Group(func(protected chi.Router) {
			protected.Use(gacsAuthMiddleware(authService))
			protected.Use(gacsWriteRoleMiddleware)

			protected.Get("/auth/user", gacsHandler.AuthUser)
			protected.Post("/auth/logout", gacsHandler.AuthLogout)
			protected.Post("/auth/change-username", gacsHandler.AuthChangeUsername)
			protected.Post("/auth/change-password", gacsHandler.AuthChangePassword)

			protected.Get("/getdevice", gacsHandler.GetDevices)
			protected.Get("/getdetaildevice/{id}", gacsHandler.GetDetailedDevice)
			protected.Post("/summon-device", gacsHandler.SummonDevice)
			protected.Post("/summon-detaildevice/{id}", gacsHandler.SummonParameters)

			protected.Post("/add-wan-ppp", gacsHandler.AddWanPPP)
			protected.Post("/add-wan-bridge", gacsHandler.AddWanBridge)
			protected.Post("/delete-wan", gacsHandler.DeleteWANConnection)
			protected.Post("/delete-wan/{id}", gacsHandler.DeleteWANConnection)
			protected.Delete("/delete-wan/{id}", gacsHandler.DeleteWANConnection)

			protected.Post("/reboot-device", gacsHandler.RebootDevice)
			protected.Delete("/delete-device/{id}", gacsHandler.DeleteDevice)

			protected.Get("/faults", gacsHandler.GetFaults)
			protected.Delete("/faults/{faultId}", gacsHandler.DeleteFault)
			protected.Delete("/delete-faults/{deviceId}", gacsHandler.DeleteDeviceFaults)

			// WAN check (GACS compat)
			protected.Get("/check-wan/{id}", gacsHandler.CheckWAN)
			protected.Get("/check-gponepon/{id}", gacsHandler.CheckGponEpon)

			// Telegram Bot settings removed

			// Portal (GACS compat)
			protected.Post("/portal/validate-accesscode", gacsHandler.PortalValidateAccessCode)

			// SSID / Config Parameter Tasks
			protected.Post("/ssid-config/set-parameter", gacsHandler.SetParameter)
			protected.Post("/ssid-config/set-multiple-parameters", gacsHandler.SetMultipleParameters)
			protected.Post("/ssid-config/add-instance", gacsHandler.AddSSIDInstance)

			protected.Post("/wan-config/set-parameter", gacsHandler.SetParameter)
			protected.Post("/wan-config/set-multiple-parameters", gacsHandler.SetMultipleParameters)

			protected.Post("/credential-config/set-parameter", gacsHandler.SetParameter)
			protected.Post("/credential-config/set-multiple-parameters", gacsHandler.SetMultipleParameters)

			protected.Post("/security-config/set-parameter", gacsHandler.SetParameter)
			protected.Post("/security-config/set-multiple-parameters", gacsHandler.SetMultipleParameters)

			protected.Post("/wifi-security-config/set-parameter", gacsHandler.SetParameter)
			protected.Post("/wifi-security-config/set-multiple-parameters", gacsHandler.SetMultipleParameters)

			// Map Settings
			protected.Get("/map-settings", gacsHandler.GetMapSettings)
			protected.Put("/map-settings", gacsHandler.UpdateMapSettings)
			protected.Post("/map-settings/reset", gacsHandler.ResetMapSettings)

			// Mapping Data (Nodes & Edges)
			protected.Get("/mapping-data/nodes", gacsHandler.GetNodes)
			protected.Get("/mapping-data/nodes/{nodeId}", gacsHandler.GetNode)
			protected.Post("/mapping-data/nodes", gacsHandler.CreateNode)
			protected.Put("/mapping-data/nodes/{nodeId}", gacsHandler.UpdateNode)
			protected.Delete("/mapping-data/nodes/{nodeId}", gacsHandler.DeleteNode)

			protected.Get("/mapping-data/edges", gacsHandler.GetEdges)
			protected.Get("/mapping-data/edges/{edgeId}", gacsHandler.GetEdge)
			protected.Post("/mapping-data/edges", gacsHandler.CreateEdge)
			protected.Put("/mapping-data/edges/{edgeId}", gacsHandler.UpdateEdge)
			protected.Delete("/mapping-data/edges/{edgeId}", gacsHandler.DeleteEdge)

			protected.Post("/mapping-data/sync", gacsHandler.SyncMappingData)
			protected.Delete("/mapping-data/reset", gacsHandler.ResetMappingData)

			// Vendor Management
			protected.Get("/vendor-management/vendors", gacsHandler.GetVendors)
			protected.Post("/vendor-management/vendors", gacsHandler.CreateVendor)
			protected.Put("/vendor-management/vendors/{id}", gacsHandler.UpdateVendor)
			protected.Delete("/vendor-management/vendors/{id}", gacsHandler.DeleteVendor)
			protected.Get("/vendor-management/sub-types/{id}", gacsHandler.GetSubTypes)
			protected.Get("/vendor-management/parameters/{id}", gacsHandler.GetParameters)
			
			// WiFi Security Config CRUD
			protected.Get("/vendor-management/wifi-security", gacsHandler.GetWifiSecurities)
			protected.Post("/vendor-management/wifi-security", gacsHandler.CreateWifiSecurity)
			protected.Put("/vendor-management/wifi-security/{id}", gacsHandler.UpdateWifiSecurity)
			protected.Delete("/vendor-management/wifi-security/{id}", gacsHandler.DeleteWifiSecurity)
			protected.Get("/vendor-management/wifi-security/{id}", gacsHandler.GetWifiSecurity)

			// Tags
			protected.Post("/devices/{id}/tags/{tag}", gacsHandler.AddDeviceTag)
			protected.Delete("/devices/{id}/tags/{tag}", gacsHandler.DeleteDeviceTag)

			// Dashboard
			protected.Get("/dashboard", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/metrics", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/connection-history", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/connection-types", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/events", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/recent-devices", gacsHandler.GetDashboardData)
			protected.Get("/dashboard/rxpower", gacsHandler.GetDashboardData)
		})
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/auth/login", authHandler.Login)
		api.Get("/meta", func(w http.ResponseWriter, r *http.Request) {
			handler.WriteMeta(w, cfg)
		})
		api.Get("/health", healthHandler.Show)
		api.Get("/livez", healthHandler.Live)
		api.Get("/readyz", healthHandler.Ready)


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
				admin.Post("/email-templates", emailTemplateHandler.Create)
				admin.Put("/email-templates/{id}", emailTemplateHandler.Update)
				admin.Delete("/email-templates/{id}", emailTemplateHandler.Delete)
				admin.Get("/settings", settingsHandler.Get)
				admin.Put("/settings", settingsHandler.Update)
				admin.Delete("/settings/{key}", settingsHandler.Delete)
				admin.Post("/backups", backupHandler.Create)
				admin.Get("/backups", backupHandler.List)
				admin.Post("/backups/{filename}/verify", backupHandler.Verify)
				admin.Get("/backups/{filename}/download", backupHandler.Download)
				admin.Post("/backups/{filename}/restore", backupHandler.SimulateRestore)
				admin.Post("/backups/staging/apply", backupHandler.ApplyRestore)
				admin.Get("/integration/check", integrationHandler.Check)
				admin.Get("/integration/mikrotik/check-profiles", integrationHandler.CheckProfiles)
				admin.Post("/integration/mikrotik/setup-profiles", integrationHandler.SetupProfiles)
				admin.Post("/integration/mikrotik/sync-import", integrationHandler.SyncImport)
				admin.Get("/integration/mikrotik/sync-packages-preview", integrationHandler.SyncPackagesPreview)
				admin.Post("/integration/mikrotik/sync-packages-import", integrationHandler.SyncPackagesImport)
				admin.Post("/integration/test-mikrotik", integrationHandler.TestMikrotik)
				admin.Post("/integration/test-genieacs", integrationHandler.TestGenieACS)
				admin.Post("/integration/test-discord", integrationHandler.TestDiscord)
				admin.Post("/integration/test-whatsapp", integrationHandler.TestWhatsApp)
				admin.Get("/mikrotik/routers", mikrotikHandler.ListRouters)
				admin.Post("/mikrotik/routers", mikrotikHandler.CreateRouter)
				admin.Put("/mikrotik/routers/{id}", mikrotikHandler.UpdateRouter)
				admin.Delete("/mikrotik/routers/{id}", mikrotikHandler.DeleteRouter)
				admin.Post("/mikrotik/routers/{id}/test", mikrotikHandler.TestRouterConnection)
				admin.Post("/mikrotik/routers/sync", mikrotikHandler.SyncRouters)
				admin.Post("/mikrotik/routers/interfaces", mikrotikHandler.GetRouterInterfaces)
				admin.Get("/mikrotik/ip-pools", mikrotikHandler.ListIPPools)
				admin.Post("/integration/test-smtp", integrationHandler.TestSMTP)
				admin.Put("/map-settings", gacsHandler.UpdateMapSettings)
				admin.Post("/map-settings/reset", gacsHandler.ResetMapSettings)
				admin.Delete("/mapping-data/reset", gacsHandler.ResetMappingData)
				admin.Get("/vouchers", voucherHandler.List)
				admin.Post("/vouchers", voucherHandler.Create)
				admin.Delete("/vouchers/{id}", voucherHandler.Delete)
				admin.Get("/vouchers/usage-logs", voucherHandler.ListUsageLogs)
				admin.Get("/vouchers/customer-vouchers", voucherHandler.ListCustomerVouchers)
			})

			// Admin + Petugas
			protected.Group(func(staff chi.Router) {
				staff.Use(requireRole("admin", "petugas"))
				staff.Post("/customers/bulk-status", customerHandler.BulkUpdateStatus)
				staff.Post("/customers/bulk-delete", customerHandler.BulkDelete)
				staff.Post("/customers", customerHandler.Create)
				staff.Put("/customers/{id}", customerHandler.Update)
				staff.Delete("/customers/{id}", customerHandler.Delete)
				staff.Post("/customers/{id}/ont-reboot", customerHandler.ONTReboot)
				staff.Post("/customers/{id}/ont-factory-reset", customerHandler.ONTFactoryReset)
				staff.Post("/customers/{id}/ont-wifi", customerHandler.ONTWifiUpdate)
				staff.Post("/customers/{id}/mikrotik-kick", customerHandler.MikrotikKick)
				staff.Patch("/customers/{id}/status", customerHandler.UpdateStatus)
				staff.Patch("/customers/{id}/odp", customerHandler.UpdateOdp)
				staff.Post("/customers/{id}/end-trial", customerHandler.EndTrial)
				staff.Post("/customers/{id}/referral/withdraw", customerHandler.WithdrawReferral)
				staff.Post("/customers/{id}/referral/convert-voucher", customerHandler.ConvertReferralToVoucher)
				staff.Get("/referral/withdrawals", customerHandler.ListReferralWithdrawals)
				staff.Post("/referral/withdrawals/{id}/complete", customerHandler.CompleteReferralWithdrawal)
				staff.Post("/referral/withdrawals/{id}/reject", customerHandler.RejectReferralWithdrawal)
				staff.Post("/customers/{id}/vouchers/claim", voucherHandler.Claim)
				staff.Post("/customers/{id}/vouchers/toggle-auto-apply", voucherHandler.ToggleAutoApply)
				staff.Post("/bills/generate", billHandler.Generate)
				staff.Post("/bills/{id}/pay", billHandler.Pay)
				staff.Post("/bills/{id}/extend", billHandler.Extend)
				staff.Post("/bills/{id}/cancel-pending", billHandler.CancelPendingAction)
				staff.Post("/bills/{id}/proof", billHandler.UploadProof)
				staff.Post("/bills/{id}/notify", billHandler.Notify)
				staff.Get("/bills/confirmations/pending", billHandler.ListPendingConfirmations)
				staff.Post("/bills/confirmations/{id}/approve", billHandler.ApprovePaymentConfirmation)
				staff.Post("/bills/confirmations/{id}/reject", billHandler.RejectPaymentConfirmation)
				staff.Post("/chatbot/confirmations", billHandler.CreatePaymentConfirmation)
				staff.Get("/bills/{id}/pending-confirmation", billHandler.GetPendingConfirmation)
				staff.Post("/bills/confirmations/upload-base64", billHandler.UploadConfirmationProofBase64)
				staff.Post("/tickets/{id}/messages", ticketHandler.AddMessage)
				staff.Post("/tickets/{id}/close", ticketHandler.Close)

				staff.Get("/inventory", inventoryHandler.ListItems)
				staff.Post("/inventory", inventoryHandler.CreateItem)
				staff.Put("/inventory/{id}", inventoryHandler.UpdateItem)
				staff.Delete("/inventory/{id}", inventoryHandler.DeleteItem)
				staff.Get("/inventory/logs", inventoryHandler.ListLogs)
				staff.Post("/inventory/{id}/logs", inventoryHandler.AddLog)

				staff.Post("/broadcast", broadcastHandler.Send)
				staff.Post("/chatbot/forms", chatbotFormHandler.Create)
				staff.Patch("/chatbot/forms/{id}", chatbotFormHandler.UpdateStatus)
				staff.Delete("/chatbot/forms/{id}", chatbotFormHandler.Delete)
				// ODP (Optical Distribution Point) management
				staff.Post("/odps", odpHandler.Create)
				staff.Put("/odps/{id}", odpHandler.Update)
				staff.Delete("/odps/{id}", odpHandler.Delete)
				staff.Get("/integration/mikrotik/sync-preview", integrationHandler.SyncPreview)

				// GenieACS Extended Endpoints (v1 session-auth variants)
				staff.Get("/gacs/devices", gacsHandler.GetDevices)
				staff.Get("/gacs/devices/{id}", gacsHandler.GetDetailedDevice)
				staff.Post("/gacs/devices/{id}/summon", gacsHandler.SummonParameters)
				staff.Post("/gacs/devices/{id}/wan", gacsHandler.CreateWANConnection)
				staff.Delete("/gacs/devices/{id}/wan", gacsHandler.DeleteWANConnection)
				staff.Get("/gacs/check-wan", gacsHandler.CheckWAN)
				staff.Get("/gacs/check-wan/{id}", gacsHandler.CheckWAN)
				staff.Get("/gacs/check-gponepon", gacsHandler.CheckGponEpon)
				staff.Get("/gacs/check-gponepon/{id}", gacsHandler.CheckGponEpon)
				// Telegram Bot settings removed
				staff.Post("/gacs/portal/validate-accesscode", gacsHandler.PortalValidateAccessCode)
				staff.Post("/mapping-data/nodes", gacsHandler.CreateNode)
				staff.Put("/mapping-data/nodes/{nodeId}", gacsHandler.UpdateNode)
				staff.Delete("/mapping-data/nodes/{nodeId}", gacsHandler.DeleteNode)
				staff.Post("/mapping-data/edges", gacsHandler.CreateEdge)
				staff.Put("/mapping-data/edges/{edgeId}", gacsHandler.UpdateEdge)
				staff.Delete("/mapping-data/edges/{edgeId}", gacsHandler.DeleteEdge)
				staff.Post("/mapping-data/sync", gacsHandler.SyncMappingData)
			})

			// All logged in users (Admin, Petugas, Viewer)
			protected.Group(func(all chi.Router) {
				all.Use(requireRole("admin", "petugas", "viewer"))
				all.Get("/dashboard/summary", dashboardHandler.Summary)
				all.Get("/packages", packageHandler.List)
				all.Get("/customers", customerHandler.List)
				all.Get("/customers/{id}", customerHandler.FindByID)
				all.Get("/customers/{id}/ont-status", customerHandler.ONTStatus)
				all.Get("/bills", billHandler.List)
				all.Get("/bills/{id}/invoice", billHandler.Invoice)
				all.Get("/bills/{id}/notifications", notificationHandler.ListByBill)
				all.Get("/templates", templateHandler.List)
				all.Get("/email-templates", emailTemplateHandler.List)
				all.Get("/odps", odpHandler.List)
				all.Get("/reports/revenue", reportsHandler.Revenue)
				all.Get("/reports/aging", reportsHandler.Aging)
				all.Get("/reports/bills/csv", reportsHandler.ExportBills)
				all.Get("/reports/customers/csv", reportsHandler.ExportCustomers)
				all.Get("/chatbot/forms", chatbotFormHandler.List)
				all.Post("/tickets", ticketHandler.CreateInternal)
				all.Get("/tickets", ticketHandler.List)
				all.Get("/tickets/{id}", ticketHandler.FindByID)
				all.Get("/map-settings", gacsHandler.GetMapSettings)
				all.Get("/mapping-data/nodes", gacsHandler.GetNodes)
				all.Get("/mapping-data/nodes/{nodeId}", gacsHandler.GetNode)
				all.Get("/mapping-data/edges", gacsHandler.GetEdges)
				all.Get("/mapping-data/edges/{edgeId}", gacsHandler.GetEdge)
				all.Get("/monitoring/traffic", mikrotikHandler.GetTrafficStats)
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
