package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	_ "github.com/go-sql-driver/mysql"

	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/backup"
	"menettech/dashboard/backend/internal/billing"
	"menettech/dashboard/backend/internal/config"
	apphttp "menettech/dashboard/backend/internal/http/router"
	"menettech/dashboard/backend/internal/importer"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/platform/database"
	"menettech/dashboard/backend/internal/platform/migrate"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
	"menettech/dashboard/backend/internal/worker"
)

func main() {
	cfg := config.Load()
	logger := newLogger(cfg.Environment)

	command := "api"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	db, err := database.Open(cfg.SQLitePath)
	if err != nil {
		logger.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer closeQuietly(db, logger)

	if err := migrate.Apply(db); err != nil {
		logger.Error("failed to apply migrations", "error", err)
		os.Exit(1)
	}

	authService := auth.Service{
		Repository: auth.Repository{
			DB: db,
		},
		SessionCookieName:      cfg.SessionCookieName,
		SessionCookieSecure:    cfg.SessionCookieSecure,
		SessionTTL:             cfg.SessionTTL,
		LoginMaxAttempts:       cfg.LoginMaxAttempts,
		LoginWindow:            time.Duration(cfg.LoginWindowMinutes) * time.Minute,
		BootstrapAdminUsername: cfg.BootstrapAdminUsername,
		BootstrapAdminPassword: cfg.BootstrapAdminPassword,
	}

	if err := authService.Bootstrap(context.Background()); err != nil {
		logger.Error("failed to bootstrap auth", "error", err)
		os.Exit(1)
	}

	switch command {
	case "api":
		if err := config.ValidateForProduction(cfg); err != nil {
			logger.Error("invalid production configuration", "error", err)
			os.Exit(1)
		}
		runAPI(cfg, logger, db, authService)
	case "worker":
		if err := config.ValidateForProduction(cfg); err != nil {
			logger.Error("invalid production configuration", "error", err)
			os.Exit(1)
		}
		runWorker(cfg, logger, db)
	case "import":
		runImport(cfg, logger, db)
	default:
		logger.Error("unknown command", "command", command)
		os.Exit(1)
	}
}

func runAPI(cfg config.Config, logger *slog.Logger, db *sql.DB, authService auth.Service) {
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           apphttp.New(cfg, logger, db, authService),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("api server starting", "addr", cfg.HTTPAddr, "sqlite_path", cfg.SQLitePath)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api server stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}()

	waitForShutdown(logger, func(ctx context.Context) error {
		return server.Shutdown(ctx)
	})
	logger.Info("api server stopped")
}

func runWorker(cfg config.Config, logger *slog.Logger, db *sql.DB) {
	settingsService := settings.Service{Repository: settings.Repository{DB: db}}
	templateService := templates.Service{Repository: templates.Repository{DB: db}}
	billingService := billing.Service{
		Repository: billing.Repository{DB: db},
		Settings:   settingsService,
	}
	whatsAppService := notifications.WhatsAppService{
		Settings:  settingsService,
		Templates: templateService,
		Logs:      notifications.NotificationLogRepository{DB: db},
	}

	intervalSeconds, err := settingsService.GetInt(context.Background(), settings.KeyWorkerIntervalSecs)
	if err != nil {
		logger.Error("failed to read worker interval", "error", err)
		os.Exit(1)
	}

	discordService := notifications.NewDiscordService(settingsService)
	backupDir := filepath.Join(cfg.StoragePath, "backups")
	backupService := backup.NewService(db, backupDir)

	service := worker.Service{
		Logger:   logger,
		Billing:  billingService,
		Settings: settingsService,
		WhatsApp: whatsAppService,
		Discord:  discordService,
		Backup:   backupService,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger.Info("worker starting", "interval_seconds", intervalSeconds)
	err = service.RunLoop(ctx, time.Duration(intervalSeconds)*time.Second)
	if err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("worker stopped unexpectedly", "error", err)
		os.Exit(1)
	}
	logger.Info("worker stopped")
}

func waitForShutdown(logger *slog.Logger, shutdownFn func(context.Context) error) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := shutdownFn(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
}

func newLogger(environment string) *slog.Logger {
	level := slog.LevelInfo
	if environment == "development" {
		level = slog.LevelDebug
	}

	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	}))
}

func closeQuietly(db *sql.DB, logger *slog.Logger) {
	if err := db.Close(); err != nil {
		logger.Warn("failed to close database", "error", fmt.Errorf("close sqlite: %w", err))
	}
}

func runImport(cfg config.Config, logger *slog.Logger, targetDB *sql.DB) {
	legacyDSN := strings.TrimSpace(os.Getenv("LEGACY_MYSQL_DSN"))
	if legacyDSN == "" {
		logger.Error("missing LEGACY_MYSQL_DSN env for import mode")
		os.Exit(1)
	}

	dryRun := strings.EqualFold(strings.TrimSpace(os.Getenv("IMPORT_DRY_RUN")), "1") ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("IMPORT_DRY_RUN")), "true")

	sourceDB, err := sql.Open("mysql", legacyDSN)
	if err != nil {
		logger.Error("failed to open legacy mysql", "error", err)
		os.Exit(1)
	}
	defer closeQuietly(sourceDB, logger)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := sourceDB.PingContext(ctx); err != nil {
		logger.Error("failed to ping legacy mysql", "error", err)
		os.Exit(1)
	}

	service := importer.Service{
		Logger:   logger,
		SourceDB: sourceDB,
		TargetDB: targetDB,
	}
	report, err := service.ImportLegacy(ctx, importer.Options{DryRun: dryRun})
	if err != nil {
		logger.Error("legacy import failed", "error", err)
		os.Exit(1)
	}

	payload := map[string]any{
		"mode":        "import",
		"dry_run":     dryRun,
		"sqlite_path": cfg.SQLitePath,
		"report":      report,
	}
	encoded, _ := json.MarshalIndent(payload, "", "  ")
	fmt.Println(string(encoded))
}
