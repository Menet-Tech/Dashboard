package integration

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"menettech/dashboard/backend/internal/settings"
)

type ServiceManager struct {
	settingsSvc         settings.Service
	logger              *slog.Logger
	sqlitePath          string
	mu                  sync.Mutex
	processes           map[string]*exec.Cmd
	restartAttempts     map[string]int   // tracks consecutive crash-restart attempts per service
	processStartedAt    map[string]time.Time // tracks when each process was last started
	runningWAAPIKey     string
	runningWAGatewayURL string
	runningWAAccountID  string
	runningDiscordToken string
}

const (
	// maxRestartAttempts is the maximum number of consecutive crash-restarts before giving up.
	maxRestartAttempts = 10
	// minRestartDelay is the base delay for the first restart attempt.
	minRestartDelay = 5 * time.Second
	// maxRestartDelay caps the exponential backoff.
	maxRestartDelay = 5 * time.Minute
	// stableRunDuration resets the restart counter if a process lives longer than this.
	stableRunDuration = 2 * time.Minute
)

func NewServiceManager(settingsSvc settings.Service, logger *slog.Logger, sqlitePath string) *ServiceManager {
	return &ServiceManager{
		settingsSvc:      settingsSvc,
		logger:           logger,
		sqlitePath:       sqlitePath,
		processes:        make(map[string]*exec.Cmd),
		restartAttempts:  make(map[string]int),
		processStartedAt: make(map[string]time.Time),
	}
}

// Reconcile checks settings in the database and ensures the services are in the correct state
func (s *ServiceManager) Reconcile(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Reconcile WhatsApp
	waEnabledStr, err := s.settingsSvc.GetString(ctx, settings.KeyWAGatewayEnabled)
	if err != nil {
		s.logger.Error("Reconcile: failed to read WhatsApp Gateway status", "error", err)
		return fmt.Errorf("read wa_gateway_enabled: %w", err)
	}
	waEnabled := waEnabledStr == "1"

	waGatewayURL, _ := s.settingsSvc.GetString(ctx, settings.KeyWAGatewayURL)
	waAPIKey, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAccountID)

	if waEnabled {
		_, running := s.processes["whatsapp"]
		configChanged := running && (s.runningWAAPIKey != waAPIKey || s.runningWAGatewayURL != waGatewayURL || s.runningWAAccountID != waAccountID)
		if configChanged {
			s.logger.Info("WhatsApp Gateway configuration changed, restarting service...")
			s.stopService("whatsapp")
		}
		if err := s.startWhatsApp(ctx); err != nil {
			s.logger.Error("Failed to start WhatsApp Gateway", "error", err)
		}
	} else {
		s.stopService("whatsapp")
	}

	// 2. Reconcile Discord Bot
	discordEnabledStr, err := s.settingsSvc.GetString(ctx, settings.KeyDiscordBotEnabled)
	if err != nil {
		s.logger.Error("Reconcile: failed to read Discord Bot status", "error", err)
		return fmt.Errorf("read discord_bot_enabled: %w", err)
	}
	discordEnabled := discordEnabledStr == "1"

	discordToken, _ := s.settingsSvc.GetString(ctx, "discord_bot_token")

	if discordEnabled {
		_, running := s.processes["discord"]
		configChanged := running && (s.runningDiscordToken != discordToken)
		if configChanged {
			s.logger.Info("Discord Bot configuration changed, restarting service...")
			s.stopService("discord")
		}
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

func findSystemdUnit(serviceName string) string {
	if runtime.GOOS != "linux" {
		return ""
	}
	candidates := []string{
		serviceName,
		"menettech-go-" + serviceName,
		"menettech-" + strings.TrimPrefix(serviceName, "menettech-go-"),
	}
	for _, c := range candidates {
		name := c
		if !strings.HasSuffix(name, ".service") {
			name = name + ".service"
		}
		if _, err := os.Stat(filepath.Join("/etc/systemd/system", name)); err == nil {
			return name
		}
	}
	return ""
}

func (s *ServiceManager) startWhatsApp(ctx context.Context) error {
	if _, running := s.processes["whatsapp"]; running {
		return nil // already running
	}

	s.logger.Info("Starting WhatsApp Gateway service...")

	// Get configuration
	waGatewayURL, _ := s.settingsSvc.GetString(ctx, settings.KeyWAGatewayURL)
	waGatewayURL = settings.ResolveWAGatewayURL(waGatewayURL)
	waAPIKey, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAPIKey)
	waAccountID, _ := s.settingsSvc.GetString(ctx, settings.KeyWAAccountID)
	if waAccountID == "" {
		waAccountID = "default"
	}

	// ── Systemd Integration on Linux Production ───────────────────────
	if unit := findSystemdUnit("whatsapp"); unit != "" {
		s.logger.Info("Starting WhatsApp Gateway via systemctl...", "unit", unit)
		if err := exec.Command("systemctl", "restart", unit).Run(); err != nil {
			s.logger.Warn("Failed to restart systemd unit, attempting start...", "unit", unit, "error", err)
			if errStart := exec.Command("systemctl", "start", unit).Run(); errStart != nil {
				return fmt.Errorf("systemctl start %s: %w", unit, errStart)
			}
		}
		dummyCmd := exec.Command("sleep", "31536000") // placeholder command to mark state as running
		if err := dummyCmd.Start(); err == nil {
			s.processes["whatsapp"] = dummyCmd
		}
		s.runningWAAPIKey = waAPIKey
		s.runningWAGatewayURL = waGatewayURL
		s.runningWAAccountID = waAccountID
		s.logger.Info("WhatsApp Gateway started successfully via systemctl", "unit", unit)
		return nil
	}

	waDir, _, _ := s.getPaths()
	if waDir == "" {
		return fmt.Errorf("could not resolve whatsapp directory path")
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

	// Start Node process with adequate memory limit for Puppeteer
	cmd := exec.Command("node", "--max-old-space-size=384", "src/server.js")
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
	s.processStartedAt["whatsapp"] = time.Now()
	s.runningWAAPIKey = waAPIKey
	s.runningWAGatewayURL = waGatewayURL
	s.runningWAAccountID = waAccountID
	s.logger.Info("WhatsApp Gateway started successfully", "pid", cmd.Process.Pid, "port", port)

	// Background goroutine to watch for unexpected termination
	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if currentCmd, exists := s.processes["whatsapp"]; exists && currentCmd == cmd {
			delete(s.processes, "whatsapp")
			s.logger.Warn("WhatsApp Gateway service exited", "error", err)

			// If the process ran stably for more than stableRunDuration, reset the counter.
			if startedAt, ok := s.processStartedAt["whatsapp"]; ok && time.Since(startedAt) > stableRunDuration {
				s.logger.Info("WhatsApp Gateway ran stably, resetting restart counter")
				s.restartAttempts["whatsapp"] = 0
			}

			attemptsNow := s.restartAttempts["whatsapp"]
			if attemptsNow >= maxRestartAttempts {
				s.logger.Error("WhatsApp Gateway has crashed too many times. Giving up to prevent resource exhaustion.",
					"attempts", attemptsNow)
				return
			}

			// Exponential backoff: 5s, 10s, 20s, 40s ... up to maxRestartDelay
			delay := time.Duration(float64(minRestartDelay) * math.Pow(2, float64(attemptsNow)))
			if delay > maxRestartDelay {
				delay = maxRestartDelay
			}
			s.restartAttempts["whatsapp"]++
			s.logger.Warn("WhatsApp Gateway will be restarted with backoff",
				"attempt", s.restartAttempts["whatsapp"],
				"max_attempts", maxRestartAttempts,
				"delay", delay)

			// Auto-restart if still enabled (with exponential backoff)
			go func() {
				time.Sleep(delay)
				s.mu.Lock()
				enabledStr, _ := s.settingsSvc.GetString(context.Background(), settings.KeyWAGatewayEnabled)
				s.mu.Unlock()
				if enabledStr == "1" {
					s.logger.Info("Attempting to auto-restart WhatsApp Gateway service...")
					_ = s.Reconcile(context.Background())
				}
			}()
		}
	}()

	return nil
}

func (s *ServiceManager) startDiscord(ctx context.Context) error {
	if _, running := s.processes["discord"]; running {
		return nil // already running
	}

	s.logger.Info("Starting Discord Bot service...")

	// ── Systemd Integration on Linux Production ───────────────────────
	if unit := findSystemdUnit("discord"); unit != "" {
		s.logger.Info("Starting Discord Bot via systemctl...", "unit", unit)
		if err := exec.Command("systemctl", "restart", unit).Run(); err != nil {
			s.logger.Warn("Failed to restart discord systemd unit, attempting start...", "unit", unit, "error", err)
			if errStart := exec.Command("systemctl", "start", unit).Run(); errStart != nil {
				return fmt.Errorf("systemctl start %s: %w", unit, errStart)
			}
		}
		dummyCmd := exec.Command("sleep", "31536000") // placeholder command to mark state as running
		if err := dummyCmd.Start(); err == nil {
			s.processes["discord"] = dummyCmd
		}
		s.logger.Info("Discord Bot started successfully via systemctl", "unit", unit)
		return nil
	}

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

	discordToken, _ := s.settingsSvc.GetString(ctx, "discord_bot_token")

	s.processes["discord"] = cmd
	s.processStartedAt["discord"] = time.Now()
	s.runningDiscordToken = discordToken
	s.logger.Info("Discord Bot started successfully", "pid", cmd.Process.Pid)

	// Background goroutine to watch for unexpected termination
	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if currentCmd, exists := s.processes["discord"]; exists && currentCmd == cmd {
			delete(s.processes, "discord")
			s.logger.Warn("Discord Bot service exited", "error", err)

			// If the process ran stably for more than stableRunDuration, reset the counter.
			if startedAt, ok := s.processStartedAt["discord"]; ok && time.Since(startedAt) > stableRunDuration {
				s.logger.Info("Discord Bot ran stably, resetting restart counter")
				s.restartAttempts["discord"] = 0
			}

			attemptsNow := s.restartAttempts["discord"]
			if attemptsNow >= maxRestartAttempts {
				s.logger.Error("Discord Bot has crashed too many times. Giving up to prevent resource exhaustion.",
					"attempts", attemptsNow)
				return
			}

			delay := time.Duration(float64(minRestartDelay) * math.Pow(2, float64(attemptsNow)))
			if delay > maxRestartDelay {
				delay = maxRestartDelay
			}
			s.restartAttempts["discord"]++
			s.logger.Warn("Discord Bot will be restarted with backoff",
				"attempt", s.restartAttempts["discord"],
				"max_attempts", maxRestartAttempts,
				"delay", delay)

			go func() {
				time.Sleep(delay)
				s.mu.Lock()
				enabledStr, _ := s.settingsSvc.GetString(context.Background(), settings.KeyDiscordBotEnabled)
				s.mu.Unlock()
				if enabledStr == "1" {
					s.logger.Info("Attempting to auto-restart Discord Bot service...")
					_ = s.Reconcile(context.Background())
				}
			}()
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
	if unit := findSystemdUnit(name); unit != "" {
		s.logger.Info(fmt.Sprintf("Stopping %s service via systemctl...", name), "unit", unit)
		_ = exec.Command("systemctl", "stop", unit).Run()
	}

	cmd, running := s.processes[name]
	if !running {
		return
	}

	s.logger.Info(fmt.Sprintf("Stopping %s service...", name))
	if cmd != nil && cmd.Process != nil {
		if err := cmd.Process.Kill(); err != nil {
			s.logger.Error(fmt.Sprintf("Failed to kill %s process", name), "error", err)
		}
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
