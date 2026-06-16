package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/bwmarrin/discordgo"
	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
)

var (
	botToken      = envOrFatal("DISCORD_BOT_TOKEN")
	applicationID = envOrFatal("DISCORD_APPLICATION_ID")
	guildID       = os.Getenv("DISCORD_GUILD_ID") // optional for guild commands
	apiBaseURL    = os.Getenv("API_BASE_URL")      // e.g. http://localhost:8080
	sqlitePath    = envOrDefault("SQLITE_PATH", "../storage/dashboard.db")

	logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	db     *sql.DB

	settingsSvc  settings.Service
	auditSvc     audit.Service
	customersSvc customers.Service
)

func main() {
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}

	var err error
	db, err = sql.Open("sqlite", sqlitePath+"?_journal_mode=WAL")
	if err != nil {
		logger.Error("open db", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	settingsSvc = settings.Service{Repository: settings.Repository{DB: db}}
	auditSvc = audit.Service{Repository: audit.Repository{DB: db}}
	customersSvc = customers.Service{Repository: customers.Repository{DB: db}, Settings: settingsSvc}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dg, err := discordgo.New("Bot " + botToken)
	if err != nil {
		logger.Error("create discord session", "error", err)
		os.Exit(1)
	}

	dg.AddHandler(interactionCreate)

	err = dg.Open()
	if err != nil {
		logger.Error("open discord gateway", "error", err)
		os.Exit(1)
	}
	defer dg.Close()

	registeredCommands := make([]*discordgo.ApplicationCommand, len(slashCommands))
	for i, v := range slashCommands {
		cmd, err := dg.ApplicationCommandCreate(dg.State.User.ID, guildID, v)
		if err != nil {
			logger.Error("cannot create command", "name", v.Name, "error", err)
			os.Exit(1)
		}
		registeredCommands[i] = cmd
		logger.Info("registered slash command", "name", v.Name)
	}

	logger.Info("Discord bot is now running. Press CTRL-C to exit.")
	<-ctx.Done()

	logger.Info("Cleaning up commands...")
	for _, v := range registeredCommands {
		if v != nil {
			err := dg.ApplicationCommandDelete(dg.State.User.ID, guildID, v.ID)
			if err != nil {
				logger.Error("cannot delete command", "name", v.Name, "error", err)
			} else {
				logger.Info("deleted command", "name", v.Name)
			}
		}
	}
	logger.Info("Discord bot stopped")
}

// ─── Command registration ────────────────────────────────────────────────────

var slashCommands = []*discordgo.ApplicationCommand{
	{
		Name:        "summary",
		Description: "Tampilkan ringkasan dashboard billing ISP",
	},
	{
		Name:        "health",
		Description: "Tampilkan status kesehatan sistem",
	},
	{
		Name:        "tagihan",
		Description: "Lihat daftar tagihan belum bayar",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionInteger,
				Name:        "limit",
				Description: "Jumlah maksimal tagihan (default 10)",
				Required:    false,
			},
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "periode",
				Description: "Filter berdasarkan periode (format YYYY-MM, contoh: 2026-06)",
				Required:    false,
			},
		},
	},
	{
		Name:        "pelanggan",
		Description: "Cari pelanggan berdasarkan nama",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "nama",
				Description: "Nama pelanggan (partial match)",
				Required:    true,
			},
		},
	},
	{
		Name:        "pengaturan",
		Description: "Kelola pengaturan sistem",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Name:        "lihat",
				Description: "Lihat daftar pengaturan atau nilai kunci tertentu",
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "kunci",
						Description: "Nama kunci pengaturan (opsional)",
						Required:    false,
					},
				},
			},
			{
				Name:        "ubah",
				Description: "Ubah nilai pengaturan",
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Options: []*discordgo.ApplicationCommandOption{
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "kunci",
						Description: "Nama kunci pengaturan",
						Required:    true,
					},
					{
						Type:        discordgo.ApplicationCommandOptionString,
						Name:        "nilai",
						Description: "Nilai baru pengaturan",
						Required:    true,
					},
				},
			},
		},
	},
	{
		Name:        "reboot",
		Description: "Reboot ONT pelanggan via GenieACS",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "target",
				Description: "Nama, User PPPoE, atau Serial Number ONT pelanggan",
				Required:    true,
			},
		},
	},
	{
		Name:        "sync",
		Description: "Sinkronisasi secret/credentials pelanggan ke MikroTik",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "target",
				Description: "Nama, User PPPoE, atau Serial Number ONT pelanggan",
				Required:    true,
			},
		},
	},
	{
		Name:        "kick",
		Description: "Putus (kick) sesi aktif PPPoE pelanggan di MikroTik",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "target",
				Description: "Nama, User PPPoE, atau Serial Number ONT pelanggan",
				Required:    true,
			},
		},
	},
	{
		Name:        "ont",
		Description: "Lihat detail status ONT pelanggan dari GenieACS",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "target",
				Description: "Nama, User PPPoE, atau Serial Number ONT pelanggan",
				Required:    true,
			},
		},
	},
}

func interactionCreate(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Type != discordgo.InteractionApplicationCommand {
		return
	}

	cmdData := i.ApplicationCommandData()
	var responseContent string

	switch cmdData.Name {
	case "summary":
		responseContent = buildSummaryMessage()
	case "health":
		responseContent = buildHealthMessage()
	case "tagihan":
		limit := 10
		periode := ""
		for _, opt := range cmdData.Options {
			switch opt.Name {
			case "limit":
				limit = int(opt.IntValue())
			case "periode":
				periode = opt.StringValue()
			}
		}
		responseContent = buildTagihanMessage(limit, periode)
	case "pelanggan":
		name := ""
		if len(cmdData.Options) > 0 {
			name = cmdData.Options[0].StringValue()
		}
		responseContent = buildPelangganMessage(name)
	case "pengaturan":
		responseContent = handlePengaturanCommand(i, cmdData.Options)
	case "reboot":
		responseContent = handleRebootCommand(i, cmdData.Options)
	case "sync":
		responseContent = handleSyncCommand(i, cmdData.Options)
	case "kick":
		responseContent = handleKickCommand(i, cmdData.Options)
	case "ont":
		responseContent = handleOntCommand(i, cmdData.Options)
	default:
		responseContent = "Unknown command"
	}

	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: responseContent,
		},
	})
	if err != nil {
		logger.Error("respond to interaction", "error", err)
	}
}

// ─── Database queries ─────────────────────────────────────────────────────────

type dashboardSummary struct {
	TotalCustomers  int
	ActiveCustomers int
	TotalBills      int
	UnpaidBills     int
	PaidBills       int
	UnpaidAmount    float64
}

func querySummary() (dashboardSummary, error) {
	var s dashboardSummary
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pelanggan`).Scan(&s.TotalCustomers); err != nil {
		return s, fmt.Errorf("count customers: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pelanggan WHERE status = 'active'`).Scan(&s.ActiveCustomers); err != nil {
		return s, fmt.Errorf("count active customers: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tagihan`).Scan(&s.TotalBills); err != nil {
		return s, fmt.Errorf("count bills: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(nominal),0) FROM tagihan WHERE status = 'belum_bayar'`).Scan(&s.UnpaidBills, &s.UnpaidAmount); err != nil {
		return s, fmt.Errorf("count unpaid bills: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tagihan WHERE status = 'lunas'`).Scan(&s.PaidBills); err != nil {
		return s, fmt.Errorf("count paid bills: %w", err)
	}
	return s, nil
}

type billRow struct {
	InvoiceNumber string
	CustomerName  string
	Period        string
	Amount        float64
	DueDate       string
}

func queryUnpaidBills(limit int, periode string) ([]billRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var rows *sql.Rows
	var err error

	periode = strings.TrimSpace(periode)
	if periode != "" {
		rows, err = db.QueryContext(ctx, `
			SELECT b.invoice_number, c.nama, b.periode, b.nominal, b.jatuh_tempo
			FROM tagihan b
			JOIN pelanggan c ON c.id = b.pelanggan_id
			WHERE b.status = 'belum_bayar' AND b.periode = ?
			ORDER BY b.jatuh_tempo ASC
			LIMIT ?
		`, periode, limit)
	} else {
		rows, err = db.QueryContext(ctx, `
			SELECT b.invoice_number, c.nama, b.periode, b.nominal, b.jatuh_tempo
			FROM tagihan b
			JOIN pelanggan c ON c.id = b.pelanggan_id
			WHERE b.status = 'belum_bayar'
			ORDER BY b.jatuh_tempo ASC
			LIMIT ?
		`, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []billRow
	for rows.Next() {
		var r billRow
		if err := rows.Scan(&r.InvoiceNumber, &r.CustomerName, &r.Period, &r.Amount, &r.DueDate); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

type customerRow struct {
	Name        string
	Status      string
	PackageName string
	Whatsapp    string
	DueDay      int
}

func queryCustomers(name string) ([]customerRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `
		SELECT c.nama, c.status, COALESCE(p.nama,'—'), c.nomor_wa, c.tgl_jatuh_tempo
		FROM pelanggan c
		LEFT JOIN paket p ON p.id = c.paket_id
		WHERE c.nama LIKE ?
		ORDER BY c.nama
		LIMIT 10
	`, "%"+name+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []customerRow
	for rows.Next() {
		var r customerRow
		if err := rows.Scan(&r.Name, &r.Status, &r.PackageName, &r.Whatsapp, &r.DueDay); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// ─── Message builders ─────────────────────────────────────────────────────────

func buildSummaryMessage() string {
	s, err := querySummary()
	if err != nil {
		return "❌ Gagal membaca data: " + err.Error()
	}
	return fmt.Sprintf(
		"📊 **Dashboard Summary**\n"+
			"👥 Total Pelanggan: **%d** (Active: %d)\n"+
			"📄 Total Tagihan: **%d** | Lunas: %d | Belum Bayar: **%d**\n"+
			"💰 Total Tunggakan: **Rp %s**",
		s.TotalCustomers, s.ActiveCustomers,
		s.TotalBills, s.PaidBills, s.UnpaidBills,
		formatRupiah(s.UnpaidAmount),
	)
}

func buildHealthMessage() string {
	httpResp, err := http.Get(apiBaseURL + "/api/v1/health")
	if err != nil {
		return "❌ Gagal menghubungi API: " + err.Error()
	}
	defer httpResp.Body.Close()

	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return "❌ Gagal membaca response API"
	}

	var result map[string]any
	if jsonErr := json.Unmarshal(body, &result); jsonErr != nil {
		return "❌ Response tidak valid"
	}
	overallStatus, _ := result["status"].(string)
	emoji := "✅"
	if overallStatus != "ok" {
		emoji = "⚠️"
	}
	msg := fmt.Sprintf("%s **Health: %s**\n", emoji, strings.ToUpper(overallStatus))
	if services, ok := result["services"].(map[string]any); ok {
		for k, v := range services {
			msg += fmt.Sprintf("  • %s: %v\n", k, v)
		}
	}
	if alerts, ok := result["alerts"].([]any); ok && len(alerts) > 0 {
		msg += "\n⚠️ Alerts:\n"
		for _, a := range alerts {
			msg += fmt.Sprintf("  - %v\n", a)
		}
	}
	return strings.TrimRight(msg, "\n")
}

func buildTagihanMessage(limit int, periode string) string {
	bills, err := queryUnpaidBills(limit, periode)
	if err != nil {
		return "❌ Gagal membaca tagihan: " + err.Error()
	}
	if len(bills) == 0 {
		if periode != "" {
			return fmt.Sprintf("✅ Tidak ada tagihan belum bayar untuk periode **%s**!", periode)
		}
		return "✅ Tidak ada tagihan belum bayar!"
	}
	var sb strings.Builder
	if periode != "" {
		sb.WriteString(fmt.Sprintf("📋 **%d Tagihan Belum Bayar Periode %s** (terdekat jatuh tempo):\n", len(bills), periode))
	} else {
		sb.WriteString(fmt.Sprintf("📋 **%d Tagihan Belum Bayar** (terdekat jatuh tempo):\n", len(bills)))
	}
	for _, b := range bills {
		sb.WriteString(fmt.Sprintf("• `%s` — %s | %s | Rp %s | Due: %s\n",
			b.InvoiceNumber, b.CustomerName, b.Period, formatRupiah(b.Amount), b.DueDate))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func buildPelangganMessage(name string) string {
	customers, err := queryCustomers(name)
	if err != nil {
		return "❌ Gagal membaca pelanggan: " + err.Error()
	}
	if len(customers) == 0 {
		return fmt.Sprintf("🔍 Tidak ada pelanggan dengan nama **%s**", name)
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("👥 **Hasil Pencarian: \"%s\"** (%d ditemukan)\n", name, len(customers)))
	for _, c := range customers {
		statusEmoji := "🟢"
		switch c.Status {
		case "limit":
			statusEmoji = "🟡"
		case "inactive":
			statusEmoji = "🔴"
		}
		sb.WriteString(fmt.Sprintf("%s **%s** | Paket: %s | WA: %s | Jatuh Tempo: tgl %d\n",
			statusEmoji, c.Name, c.PackageName, c.Whatsapp, c.DueDay))
	}
	return strings.TrimRight(sb.String(), "\n")
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func formatRupiah(amount float64) string {
	s := fmt.Sprintf("%.0f", amount)
	if len(s) <= 3 {
		return s
	}
	var result []byte
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, byte(c))
	}
	return string(result)
}

func envOrFatal(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fmt.Fprintf(os.Stderr, "ERROR: required env var %q is not set\n", key)
		os.Exit(1)
	}
	return v
}

func envOrDefault(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}

// ─── Settings subcommand handlers ─────────────────────────────────────────────

func handlePengaturanCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) string {
	if len(options) == 0 {
		return "❌ Subcommand tidak ditemukan."
	}
	subCmd := options[0]
	switch subCmd.Name {
	case "lihat":
		var kunci string
		if len(subCmd.Options) > 0 {
			kunci = subCmd.Options[0].StringValue()
		}
		return buildLihatPengaturanMessage(kunci)
	case "ubah":
		var kunci, nilai string
		for _, opt := range subCmd.Options {
			switch opt.Name {
			case "kunci":
				kunci = opt.StringValue()
			case "nilai":
				nilai = opt.StringValue()
			}
		}
		if kunci == "" {
			return "❌ Kunci tidak boleh kosong."
		}
		discordUser := getDiscordUser(i)
		return buildUbahPengaturanMessage(discordUser, kunci, nilai)
	default:
		return "❌ Subcommand tidak dikenal."
	}
}

func getDiscordUser(i *discordgo.InteractionCreate) string {
	if i.User != nil {
		return i.User.Username
	}
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User.Username
	}
	return "unknown"
}

func buildLihatPengaturanMessage(kunci string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if kunci != "" {
		kunci = strings.TrimSpace(kunci)
		if !settings.IsAllowedKey(kunci) {
			return fmt.Sprintf("❌ Kunci tidak dikenal: `%s`", kunci)
		}
		val, err := settingsSvc.GetString(ctx, kunci)
		if err != nil {
			return fmt.Sprintf("❌ Gagal mengambil pengaturan: %s", err.Error())
		}
		if isSensitiveKey(kunci) && val != "" {
			val = "••••••••"
		}
		return fmt.Sprintf("⚙️ **Pengaturan**\n• `%s`: `%s`", kunci, val)
	}

	all, err := settingsSvc.GetAll(ctx)
	if err != nil {
		return fmt.Sprintf("❌ Gagal mengambil semua pengaturan: %s", err.Error())
	}

	var sb strings.Builder
	sb.WriteString("⚙️ **Daftar Pengaturan Sistem**:\n")
	var keys []string
	for k := range all {
		if !strings.HasPrefix(k, "worker_") {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	for _, k := range keys {
		val := all[k]
		if isSensitiveKey(k) && val != "" {
			val = "••••••••"
		}
		sb.WriteString(fmt.Sprintf("• `%s`: `%s`\n", k, val))
	}
	return sb.String()
}

func buildUbahPengaturanMessage(discordUser, kunci, nilai string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	kunci = strings.TrimSpace(kunci)
	nilai = strings.TrimSpace(nilai)

	if !settings.IsAllowedKey(kunci) {
		return fmt.Sprintf("❌ Kunci tidak dikenal: `%s`", kunci)
	}

	if (kunci == "wa_gateway_url" || kunci == settings.KeyDiscordWebhookURL || kunci == settings.KeyACSURL) && nilai != "" {
		if _, err := url.ParseRequestURI(nilai); err != nil {
			return fmt.Sprintf("❌ URL tidak valid untuk: `%s`", kunci)
		}
	}

	err := settingsSvc.Set(ctx, kunci, nilai)
	if err != nil {
		return fmt.Sprintf("❌ Gagal mengubah pengaturan: %s", err.Error())
	}

	logMsg := fmt.Sprintf("Discord user %s updated setting %s to %s", discordUser, kunci, nilai)
	if isSensitiveKey(kunci) {
		logMsg = fmt.Sprintf("Discord user %s updated setting %s", discordUser, kunci)
	}
	_ = auditSvc.Record(ctx, nil, nil, "settings.update_discord", logMsg)

	displayValue := nilai
	if isSensitiveKey(kunci) {
		displayValue = "••••••••"
	}

	return fmt.Sprintf("✅ Berhasil memperbarui pengaturan `%s` menjadi `%s`", kunci, displayValue)
}

func isSensitiveKey(k string) bool {
	k = strings.ToLower(k)
	return strings.Contains(k, "pass") || strings.Contains(k, "key") || strings.Contains(k, "token") || strings.Contains(k, "secret")
}

func findCustomerByTarget(ctx context.Context, target string) (customers.Customer, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return customers.Customer{}, fmt.Errorf("target tidak boleh kosong")
	}

	// 1. Exact match user_pppoe, sn_ont, or name
	row := db.QueryRowContext(ctx, `
		SELECT id FROM pelanggan 
		WHERE user_pppoe = ? OR sn_ont = ? OR nama = ?
		LIMIT 1
	`, target, target, target)
	var id int64
	err := row.Scan(&id)
	if err == nil {
		return customersSvc.FindByID(ctx, id)
	}

	// 2. Partial match
	row = db.QueryRowContext(ctx, `
		SELECT id FROM pelanggan 
		WHERE user_pppoe LIKE ? OR sn_ont LIKE ? OR nama LIKE ?
		LIMIT 1
	`, "%"+target+"%", "%"+target+"%", "%"+target+"%")
	err = row.Scan(&id)
	if err == nil {
		return customersSvc.FindByID(ctx, id)
	}

	return customers.Customer{}, fmt.Errorf("pelanggan dengan target '%s' tidak ditemukan", target)
}

func handleRebootCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) string {
	if len(options) == 0 {
		return "❌ Parameter `target` diperlukan."
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return "❌ " + err.Error()
	}

	if strings.TrimSpace(cust.SNOnt) == "" {
		return fmt.Sprintf("❌ Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name)
	}

	acsURL, err := settingsSvc.GetString(ctx, settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := settingsSvc.GetString(ctx, settings.KeyACSUsername)
	acsPass, _ := settingsSvc.GetString(ctx, settings.KeyACSPassword)
	acsClient := acs.NewClient(acsURL, acsUser, acsPass)

	err = acsClient.RebootDevice(ctx, cust.SNOnt)
	if err != nil {
		return fmt.Sprintf("❌ Gagal mengirim perintah reboot untuk ONT **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err)
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.ont_reboot", fmt.Sprintf("User %s rebooted ONT for customer %s (SN: %s) via Discord bot", discordUser, cust.Name, cust.SNOnt))

	return fmt.Sprintf("✅ Perintah reboot berhasil dikirim ke GenieACS untuk pelanggan **%s** (SN: %s). ONT akan segera dimuat ulang.", cust.Name, cust.SNOnt)
}

func handleSyncCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) string {
	if len(options) == 0 {
		return "❌ Parameter `target` diperlukan."
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return "❌ " + err.Error()
	}

	if strings.TrimSpace(cust.UserPPPoE) == "" {
		return fmt.Sprintf("❌ Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name)
	}

	err = customersSvc.SyncToMikrotik(ctx, cust)
	if err != nil {
		return fmt.Sprintf("❌ Gagal melakukan sinkronisasi credentials pelanggan **%s** ke MikroTik: %v", cust.Name, err)
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.customer_sync", fmt.Sprintf("User %s synced customer %s to MikroTik via Discord bot", discordUser, cust.Name))

	return fmt.Sprintf("✅ Berhasil mensinkronkan PPPoE credentials pelanggan **%s** (User: %s) ke MikroTik.", cust.Name, cust.UserPPPoE)
}

func handleKickCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) string {
	if len(options) == 0 {
		return "❌ Parameter `target` diperlukan."
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return "❌ " + err.Error()
	}

	if strings.TrimSpace(cust.UserPPPoE) == "" {
		return fmt.Sprintf("❌ Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name)
	}

	mikrotikHost, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikHost)
	mikrotikUser, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikUser)
	mikrotikPass, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikPass)
	if strings.TrimSpace(mikrotikHost) == "" || strings.TrimSpace(mikrotikUser) == "" {
		return "❌ MikroTik host atau user belum terkonfigurasi di pengaturan sistem."
	}

	client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
	if err := client.Connect(ctx); err != nil {
		return fmt.Sprintf("❌ Gagal terhubung ke MikroTik: %v", err)
	}
	defer client.Close()

	err = client.KickUser(ctx, cust.UserPPPoE)
	if err != nil {
		return fmt.Sprintf("❌ Gagal memutuskan sesi aktif PPPoE pelanggan **%s** (User: %s) di MikroTik: %v", cust.Name, cust.UserPPPoE, err)
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.customer_kick", fmt.Sprintf("User %s kicked active PPPoE session for customer %s (User: %s) via Discord bot", discordUser, cust.Name, cust.UserPPPoE))

	return fmt.Sprintf("✅ Sesi aktif PPPoE pelanggan **%s** (User: %s) berhasil diputuskan (kick) di MikroTik.", cust.Name, cust.UserPPPoE)
}

func handleOntCommand(_ *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) string {
	if len(options) == 0 {
		return "❌ Parameter `target` diperlukan."
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return "❌ " + err.Error()
	}

	if strings.TrimSpace(cust.SNOnt) == "" {
		return fmt.Sprintf("❌ Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name)
	}

	acsURL, err := settingsSvc.GetString(ctx, settings.KeyACSURL)
	if err != nil || acsURL == "" {
		acsURL = "http://localhost:7557"
	}
	acsUser, _ := settingsSvc.GetString(ctx, settings.KeyACSUsername)
	acsPass, _ := settingsSvc.GetString(ctx, settings.KeyACSPassword)
	acsClient := acs.NewClient(acsURL, acsUser, acsPass)

	status, err := acsClient.GetDeviceStatus(ctx, cust.SNOnt)
	if err != nil {
		return fmt.Sprintf("❌ Gagal mengambil status ONT dari GenieACS untuk pelanggan **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err)
	}

	statusEmoji := "🟢 ONLINE"
	if status.Status == "offline" {
		statusEmoji = "🔴 OFFLINE"
	}

	return fmt.Sprintf(
		"📡 **Detail Status ONT Pelanggan**\n"+
			"• **Nama Pelanggan**: %s\n"+
			"• **User PPPoE**: %s\n"+
			"• **Model ONT**: %s\n"+
			"• **Serial Number**: `%s`\n"+
			"• **IP Address**: %s\n"+
			"• **Uptime ONT**: %s\n"+
			"• **Redaman (Rx Optical)**: `%s` (Tx: `%s`)\n"+
			"• **Status Koneksi**: %s\n"+
			"• **Last Inform**: %s",
		cust.Name,
		cust.UserPPPoE,
		status.Model,
		status.SerialNumber,
		status.IPAddress,
		status.Uptime,
		status.RxOpticalPower,
		status.TxOpticalPower,
		statusEmoji,
		status.LastInformTime.Format("2006-01-02 15:04:05"),
	)
}
