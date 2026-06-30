package integration

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"menettech/dashboard/backend/internal/settings"
)

type ServiceManager struct {
	settingsSvc settings.Service
	logger      *slog.Logger
	sqlitePath  string
	mu          sync.Mutex
	processes   map[string]*exec.Cmd
}

func NewServiceManager(settingsSvc settings.Service, logger *slog.Logger, sqlitePath string) *ServiceManager {
	return &ServiceManager{
		settingsSvc: settingsSvc,
		logger:      logger,
		sqlitePath:  sqlitePath,
		processes:   make(map[string]*exec.Cmd),
	}
}

// Reconcile checks settings in the database and ensures the services are in the correct state
func (s *ServiceManager) Reconcile(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Reconcile WhatsApp
	waEnabledStr, err := s.settingsSvc.GetString(ctx, settings.KeyWAGatewayEnabled)
	if err != nil {
		waEnabledStr = "0"
	}
	waEnabled := waEnabledStr == "1"

	if waEnabled {
		if err := s.startWhatsApp(ctx); err != nil {
			s.logger.Error("Failed to start WhatsApp Gateway", "error", err)
		}
	} else {
		s.stopService("whatsapp")
	}

	// 2. Reconcile Discord Bot
	discordEnabledStr, err := s.settingsSvc.GetString(ctx, settings.KeyDiscordBotEnabled)
	if err != nil {
		discordEnabledStr = "0"
	}
	discordEnabled := discordEnabledStr == "1"

	if discordEnabled {
		if err := s.startDiscord(ctx); err != nil {
			s.logger.Error("Failed to start Discord Bot", "error", err)
		}
	} else {
		s.stopService("discord")
	}

	return nil
}

func (s *ServiceManager) getPaths() (waDir string, discordBotBin string, isProd bool) {
	// Check if running in production layout:
	// API working directory: /opt/menettech-go/backend
	// WhatsApp source directory: /opt/menettech-go/integration/whatsapp
	// Discord Bot precompiled binary: /opt/menettech-go/integration/discord-bot
	wd, err := os.Getwd()
	if err == nil {
		prodWaDir := filepath.Clean(filepath.Join(wd, "..", "integration", "whatsapp"))
		prodDiscordBotBin := filepath.Clean(filepath.Join(wd, "..", "integration", "discord-bot"))
		if _, err := os.Stat(prodWaDir); err == nil {
			return prodWaDir, prodDiscordBotBin, true
		}
	}

	// Fallback to development mode finding repo root
	repoRoot, err := findRepoRoot()
	if err != nil {
		return "", "", false
	}
	waDir = filepath.Join(repoRoot, "whatsapp")
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	discordBotBin = filepath.Join(repoRoot, "backend", "bin", "discord-bot"+ext)
	return waDir, discordBotBin, false
}

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		whatsappDir := filepath.Join(dir, "whatsapp")
		backendDir := filepath.Join(dir, "backend")

		waInfo, err1 := os.Stat(whatsappDir)
		beInfo, err2 := os.Stat(backendDir)

		if err1 == nil && waInfo.IsDir() && err2 == nil && beInfo.IsDir() {
			return dir, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find repository root containing both backend and whatsapp directories")
}

func (s *ServiceManager) startWhatsApp(ctx context.Context) error {
	if _, running := s.processes["whatsapp"]; running {
		return nil // already running
	}

	s.logger.Info("Starting WhatsApp Gateway service...")

	waDir, _, _ := s.getPaths()
	if waDir == "" {
		return fmt.Errorf("could not resolve whatsapp directory path")
	}

	// Get configuration
	waGatewayURL, _ := s.settingsSvc.GetString(ctx, settings.KeyWAGatewayURL)
	if waGatewayURL == "" {
		waGatewayURL = "http://localhost:3001"
	}
	waAPIKey, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAccountID)
	if waAccountID == "" {
		waAccountID = "default"
	}

	apiURL, _ := s.settingsSvc.GetString(ctx, "dashboard_api_url")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	}

	// Extract port from Gateway URL
	port := "3001"
	if u, err := url.Parse(waGatewayURL); err == nil {
		if p := u.Port(); p != "" {
			port = p
		}
	}

	// Start Node process directly
	cmd := exec.Command("node", "src/server.js")
	cmd.Dir = waDir

	// Configure environment variables
	env := os.Environ()
	env = append(env, fmt.Sprintf("PORT=%s", port))
	env = append(env, fmt.Sprintf("DASHBOARD_API_URL=%s", apiURL))
	env = append(env, fmt.Sprintf("DASHBOARD_INTERNAL_API_KEY=%s", waAPIKey))
	env = append(env, fmt.Sprintf("API_KEY=%s", waAPIKey))
	env = append(env, fmt.Sprintf("WA_ACCOUNT_ID=%s", waAccountID))
	
	// Pass home or user-specific Puppeteer variables
	if homeDir := os.Getenv("HOME"); homeDir != "" {
		env = append(env, fmt.Sprintf("HOME=%s", homeDir))
		env = append(env, fmt.Sprintf("PUPPETEER_CACHE_DIR=%s/.cache/puppeteer", homeDir))
	}
	cmd.Env = env

	// Capture outputs to standard outputs
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start whatsapp node process: %w", err)
	}

	s.processes["whatsapp"] = cmd
	s.logger.Info("WhatsApp Gateway started successfully", "pid", cmd.Process.Pid, "port", port)

	// Background goroutine to watch for unexpected termination
	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if currentCmd, exists := s.processes["whatsapp"]; exists && currentCmd == cmd {
			delete(s.processes, "whatsapp")
			s.logger.Warn("WhatsApp Gateway service exited", "error", err)
		}
	}()

	return nil
}

func (s *ServiceManager) startDiscord(_ context.Context) error {
	if _, running := s.processes["discord"]; running {
		return nil // already running
	}

	s.logger.Info("Starting Discord Bot service...")

	_, discordBotBin, isProd := s.getPaths()
	if discordBotBin == "" {
		return fmt.Errorf("could not resolve discord bot binary path")
	}

	// 1. Compile Discord Bot only in development
	if !isProd {
		repoRoot, err := findRepoRoot()
		if err != nil {
			return fmt.Errorf("find repo root: %w", err)
		}
		backendDir := filepath.Join(repoRoot, "backend")
		if err := s.compileDiscordBot(backendDir); err != nil {
			return fmt.Errorf("compile discord bot: %w", err)
		}
	}

	// 2. Start the binary
	cmd := exec.Command(discordBotBin)
	cmd.Dir = filepath.Dir(discordBotBin)

	// Configure environment variables
	env := os.Environ()
	dbPath := s.sqlitePath
	if !filepath.IsAbs(dbPath) {
		wd, _ := os.Getwd()
		dbPath = filepath.Clean(filepath.Join(wd, dbPath))
	}
	env = append(env, fmt.Sprintf("SQLITE_PATH=%s", dbPath))
	cmd.Env = env

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start discord bot process: %w", err)
	}

	s.processes["discord"] = cmd
	s.logger.Info("Discord Bot started successfully", "pid", cmd.Process.Pid)

	// Background goroutine to watch for unexpected termination
	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if currentCmd, exists := s.processes["discord"]; exists && currentCmd == cmd {
			delete(s.processes, "discord")
			s.logger.Warn("Discord Bot service exited", "error", err)
		}
	}()

	return nil
}

func (s *ServiceManager) compileDiscordBot(backendDir string) error {
	s.logger.Info("Compiling Discord Bot binary...")
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	binDir := filepath.Join(backendDir, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("create bin dir: %w", err)
	}
	binaryPath := filepath.Join(binDir, "discord-bot"+ext)

	cmd := exec.Command("go", "build", "-o", binaryPath, "./cmd/discord-bot")
	cmd.Dir = backendDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return err
	}
	s.logger.Info("Discord Bot compiled successfully", "path", binaryPath)
	return nil
}

func (s *ServiceManager) stopService(name string) {
	cmd, running := s.processes[name]
	if !running {
		return
	}

	s.logger.Info(fmt.Sprintf("Stopping %s service...", name))
	if err := cmd.Process.Kill(); err != nil {
		s.logger.Error(fmt.Sprintf("Failed to kill %s process", name), "error", err)
	}
	delete(s.processes, name)
	s.logger.Info(fmt.Sprintf("%s service stopped successfully", name))
}

// StopAll stops all running subprocesses
func (s *ServiceManager) StopAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for name := range s.processes {
		s.stopService(name)
	}
}
