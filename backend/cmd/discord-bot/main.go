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

	"menettech/dashboard/backend/internal/acs"
	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/billing"
	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/platform/database"
	"menettech/dashboard/backend/internal/settings"
)

var (
	botToken      string
	applicationID string
	guildID       string
	apiBaseURL    = os.Getenv("API_BASE_URL") // e.g. http://localhost:8080
	sqlitePath    = envOrDefault("SQLITE_PATH", "../storage/dashboard.db")

	logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	db     *sql.DB

	settingsSvc  settings.Service
	auditSvc     audit.Service
	customersSvc customers.Service
	billingSvc   billing.Service
)

func main() {
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}

	var err error
	db, err = database.Open(sqlitePath)
	if err != nil {
		logger.Error("open db", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	settingsSvc = settings.Service{Repository: settings.Repository{DB: db}}
	auditSvc = audit.Service{Repository: audit.Repository{DB: db}}
	customersSvc = customers.Service{Repository: customers.Repository{DB: db}, Settings: settingsSvc}
	billingSvc = billing.Service{Repository: billing.Repository{DB: db}, Settings: settingsSvc, Customers: customersSvc}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Load settings from env or database
	botToken = os.Getenv("DISCORD_BOT_TOKEN")
	if botToken == "" {
		botToken, _ = settingsSvc.GetString(ctx, "discord_bot_token")
	}
	if botToken == "" {
		logger.Error("DISCORD_BOT_TOKEN is not set in env or settings")
		os.Exit(1)
	}

	applicationID = os.Getenv("DISCORD_APPLICATION_ID")
	if applicationID == "" {
		applicationID, _ = settingsSvc.GetString(ctx, "discord_bot_application_id")
	}
	if applicationID == "" {
		logger.Error("DISCORD_APPLICATION_ID is not set in env or settings")
		os.Exit(1)
	}

	guildID = os.Getenv("DISCORD_GUILD_ID")
	if guildID == "" {
		guildID, _ = settingsSvc.GetString(ctx, "discord_bot_guild_id")
	}

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

	var requiredPerms int64 = discordgo.PermissionAdministrator | discordgo.PermissionManageServer
	registeredCommands := make([]*discordgo.ApplicationCommand, len(slashCommands))
	for i, v := range slashCommands {
		v.DefaultMemberPermissions = &requiredPerms
		cmd, err := dg.ApplicationCommandCreate(dg.State.User.ID, guildID, v)
		if err != nil {
			logger.Error("cannot create command", "name", v.Name, "error", err)
			os.Exit(1)
		}
		registeredCommands[i] = cmd
		logger.Info("registered slash command", "name", v.Name)
	}

	// Clean up stale slash commands from previous runs
	if existingCmds, err := dg.ApplicationCommands(dg.State.User.ID, guildID); err == nil {
		desiredMap := make(map[string]bool)
		for _, sc := range slashCommands {
			desiredMap[sc.Name] = true
		}
		for _, ec := range existingCmds {
			if !desiredMap[ec.Name] {
				_ = dg.ApplicationCommandDelete(dg.State.User.ID, guildID, ec.ID)
				logger.Info("cleaned up old command from discord", "name", ec.Name)
			}
		}
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
		Name:        "dashboard",
		Description: "Pusat monitoring & kontrol interaktif (summary, health, dan navigasi cepat)",
	},
	{
		Name:        "sesi",
		Description: "Lihat status sesi PPPoE pelanggan (aktif/online atau mati/offline)",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Name:        "ringkasan",
				Description: "Tampilkan jumlah pelanggan yang online dan offline",
				Type:        discordgo.ApplicationCommandOptionSubCommand,
			},
			{
				Name:        "aktif",
				Description: "Tampilkan daftar sesi yang sedang aktif (online)",
				Type:        discordgo.ApplicationCommandOptionSubCommand,
			},
			{
				Name:        "mati",
				Description: "Tampilkan daftar sesi yang sedang mati (offline)",
				Type:        discordgo.ApplicationCommandOptionSubCommand,
			},
		},
	},
	{
		Name:        "pelanggan",
		Description: "Cari dan kelola pelanggan secara interaktif (ONT, MikroTik, status, tagihan)",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "nama",
				Description: "Nama pelanggan (partial match, opsional)",
				Required:    false,
			},
		},
	},
	{
		Name:        "tagihan",
		Description: "Lihat dan kelola daftar tagihan belum bayar secara interaktif",
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
}

func interactionCreate(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Type != discordgo.InteractionApplicationCommand && i.Type != discordgo.InteractionMessageComponent {
		return
	}

	// Security Check: Only allow administrators or server managers to run commands, and block DM commands
	if i.Member != nil {
		const requiredPerms = discordgo.PermissionAdministrator | discordgo.PermissionManageServer
		if i.Member.Permissions&requiredPerms == 0 {
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseChannelMessageWithSource,
				Data: &discordgo.InteractionResponseData{
					Embeds: []*discordgo.MessageEmbed{
						errorEmbed("Akses Ditolak: Anda tidak memiliki izin Administrator atau Kelola Server untuk menjalankan perintah ini."),
					},
					Flags: discordgo.MessageFlagsEphemeral,
				},
			})
			return
		}
	} else {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Embeds: []*discordgo.MessageEmbed{
					errorEmbed("Akses Ditolak: Perintah hanya dapat dijalankan di dalam Server resmi."),
				},
				Flags: discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	if i.Type == discordgo.InteractionMessageComponent {
		handleComponentInteraction(s, i)
		return
	}

	cmdData := i.ApplicationCommandData()
	var embed *discordgo.MessageEmbed
	var components []discordgo.MessageComponent

	switch cmdData.Name {
	case "dashboard":
		embed, components = buildDashboardEmbed()
	case "sesi":
		subcmd := ""
		if len(cmdData.Options) > 0 {
			subcmd = cmdData.Options[0].Name
		}
		if subcmd == "" {
			subcmd = "ringkasan"
		}
		embed, components = buildSesiInteractiveEmbed(subcmd, 0, 10)
	case "tagihan":
		limit := 5
		periode := ""
		for _, opt := range cmdData.Options {
			switch opt.Name {
			case "limit":
				limit = int(opt.IntValue())
			case "periode":
				periode = opt.StringValue()
			}
		}
		embed, components = buildTagihanInteractiveEmbed(limit, periode, 0)
	case "pelanggan":
		name := ""
		for _, opt := range cmdData.Options {
			if opt.Name == "nama" {
				name = opt.StringValue()
			}
		}
		embed, components = buildPelangganEmbed(name, 0)
	case "pengaturan":
		embed = handlePengaturanCommand(i, cmdData.Options)
	default:
		embed = errorEmbed("Perintah tidak dikenal.")
	}

	if embed.Timestamp == "" {
		embed.Timestamp = time.Now().Format(time.RFC3339)
	}
	if embed.Footer == nil {
		embed.Footer = &discordgo.MessageEmbedFooter{
			Text: "Menet-Tech Dashboard Bot",
		}
	}

	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
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
	ID            int64
	InvoiceNumber string
	CustomerName  string
	Period        string
	Amount        float64
	DueDate       string
}

func queryUnpaidBills(limit int, periode string) ([]billRow, error) {
	return queryUnpaidBillsOffset(limit, periode, 0)
}

func queryUnpaidBillsOffset(limit int, periode string, offset int) ([]billRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var rows *sql.Rows
	var err error

	periode = strings.TrimSpace(periode)
	if periode != "" {
		rows, err = db.QueryContext(ctx, `
			SELECT b.id, b.invoice_number, c.nama, b.periode, b.nominal, b.jatuh_tempo
			FROM tagihan b
			JOIN pelanggan c ON c.id = b.pelanggan_id
			WHERE b.status = 'belum_bayar' AND b.periode = ?
			ORDER BY b.jatuh_tempo ASC
			LIMIT ? OFFSET ?
		`, periode, limit, offset)
	} else {
		rows, err = db.QueryContext(ctx, `
			SELECT b.id, b.invoice_number, c.nama, b.periode, b.nominal, b.jatuh_tempo
			FROM tagihan b
			JOIN pelanggan c ON c.id = b.pelanggan_id
			WHERE b.status = 'belum_bayar'
			ORDER BY b.jatuh_tempo ASC
			LIMIT ? OFFSET ?
		`, limit, offset)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []billRow
	for rows.Next() {
		var r billRow
		if err := rows.Scan(&r.ID, &r.InvoiceNumber, &r.CustomerName, &r.Period, &r.Amount, &r.DueDate); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

type customerRow struct {
	ID          int64
	Name        string
	Status      string
	PackageName string
	Whatsapp    string
	DueDay      int
}

func queryCustomers(name string, offset int, limit int) ([]customerRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `
		SELECT c.id, c.nama, c.status, COALESCE(p.nama,'—'), c.nomor_wa, c.tgl_jatuh_tempo
		FROM pelanggan c
		LEFT JOIN paket p ON p.id = c.paket_id
		WHERE c.nama LIKE ?
		ORDER BY c.nama
		LIMIT ? OFFSET ?
	`, "%"+name+"%", limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []customerRow
	for rows.Next() {
		var r customerRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Status, &r.PackageName, &r.Whatsapp, &r.DueDay); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

type sesiRow struct {
	ID          int64
	Name        string
	UserPPPoE   string
	Status      string
	PppoeStatus string
	PppoeUptime string
	LastSyncAt  string
}

func querySesi(status string, offset int, limit int) ([]sesiRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var rows *sql.Rows
	var err error

	if status == "aktif" {
		rows, err = db.QueryContext(ctx, `
			SELECT id, nama, user_pppoe, status, COALESCE(pppoe_status, ''), COALESCE(pppoe_uptime, ''), COALESCE(last_sync_at, '')
			FROM pelanggan
			WHERE status = 'active' AND pppoe_status = 'online'
			ORDER BY nama ASC
			LIMIT ? OFFSET ?
		`, limit, offset)
	} else {
		// mati (offline)
		rows, err = db.QueryContext(ctx, `
			SELECT id, nama, user_pppoe, status, COALESCE(pppoe_status, ''), COALESCE(pppoe_uptime, ''), COALESCE(last_sync_at, '')
			FROM pelanggan
			WHERE status = 'active' AND (pppoe_status = 'offline' OR pppoe_status IS NULL OR pppoe_status = '')
			ORDER BY last_sync_at DESC
			LIMIT ? OFFSET ?
		`, limit, offset)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []sesiRow
	for rows.Next() {
		var r sesiRow
		if err := rows.Scan(&r.ID, &r.Name, &r.UserPPPoE, &r.Status, &r.PppoeStatus, &r.PppoeUptime, &r.LastSyncAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

type sesiSummary struct {
	TotalActive int
	Online      int
	Offline     int
}

func querySesiSummary() (sesiSummary, error) {
	var s sesiSummary
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pelanggan WHERE status = 'active'`).Scan(&s.TotalActive); err != nil {
		return s, err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pelanggan WHERE status = 'active' AND pppoe_status = 'online'`).Scan(&s.Online); err != nil {
		return s, err
	}
	s.Offline = s.TotalActive - s.Online
	return s, nil
}

// ─── Message builders (Rich Embeds) ──────────────────────────────────────────

func buildRythmTabs(activeTab string) discordgo.ActionsRow {
	styleDash, styleTagihan, stylePelanggan, styleHealth := discordgo.SecondaryButton, discordgo.SecondaryButton, discordgo.SecondaryButton, discordgo.SecondaryButton
	switch activeTab {
	case "dashboard":
		styleDash = discordgo.PrimaryButton
	case "tagihan":
		styleTagihan = discordgo.PrimaryButton
	case "pelanggan":
		stylePelanggan = discordgo.PrimaryButton
	case "health":
		styleHealth = discordgo.PrimaryButton
	}
	return discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{
			discordgo.Button{CustomID: "tab_dashboard", Label: "📊 Dashboard", Style: styleDash},
			discordgo.Button{CustomID: "tab_tagihan", Label: "📋 Tagihan", Style: styleTagihan},
			discordgo.Button{CustomID: "tab_pelanggan", Label: "👥 Pelanggan", Style: stylePelanggan},
			discordgo.Button{CustomID: "tab_health", Label: "🏥 Health", Style: styleHealth},
		},
	}
}

func buildRythmRow2(_ string, refreshID string) discordgo.ActionsRow {
	return discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{
			discordgo.Button{CustomID: "dash_close", Label: "✕ Close Menu", Style: discordgo.SecondaryButton},
			discordgo.Button{CustomID: refreshID, Label: "🔄 Refresh Data", Style: discordgo.SecondaryButton},
		},
	}
}

func buildDashboardEmbed() (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	s, err := querySummary()
	if err != nil {
		return errorEmbed("Gagal membaca summary: " + err.Error()), nil
	}
	embed := &discordgo.MessageEmbed{
		Title: "📊 Pusat Monitoring Dashboard Billing ISP",
		Description: fmt.Sprintf(
			"**1. Total Pelanggan Terdaftar**\n`%d Pelanggan` dalam database sistem\n\n"+
				"**2. Pelanggan Aktif (Online)**\n`%d Pelanggan` memiliki sesi PPPoE/Layanan aktif\n\n"+
				"**3. Tagihan Menunggak (Belum Bayar)**\n`%d Tagihan` belum terbayar (Total Tunggakan: **Rp %s**)\n\n"+
				"**4. Tagihan Lunas Bulan Ini**\n`%d Tagihan` telah dibayarkan dengan sukses\n\n"+
				"Page 1/1",
			s.TotalCustomers, s.ActiveCustomers, s.UnpaidBills, formatRupiah(s.UnpaidAmount), s.PaidBills),
		Color: 0x5865F2, // Rythm Blue
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Gunakan tab navigasi di atas atau shortcut cepat di bawah",
		},
	}

	row1 := buildRythmTabs("dashboard")
	row2 := buildRythmRow2("dashboard", "refresh_dashboard")

	row3 := discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{
			discordgo.Button{CustomID: "dash_shortcut_pelanggan", Label: "👥 1 & 2. Lihat Pelanggan", Style: discordgo.SecondaryButton},
			discordgo.Button{CustomID: "dash_shortcut_tagihan", Label: "📋 3. Lihat Tagihan Menunggak", Style: discordgo.PrimaryButton},
			discordgo.Button{CustomID: "dash_shortcut_health", Label: "🏥 Status Sistem API", Style: discordgo.SecondaryButton},
		},
	}

	return embed, []discordgo.MessageComponent{row1, row2, row3}
}

func buildHealthEmbed() *discordgo.MessageEmbed {
	httpResp, err := http.Get(apiBaseURL + "/api/v1/health")
	if err != nil {
		return errorEmbed("Gagal menghubungi API server: " + err.Error())
	}
	defer httpResp.Body.Close()

	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return errorEmbed("Gagal membaca status kesehatan dari API")
	}

	var result map[string]any
	if jsonErr := json.Unmarshal(body, &result); jsonErr != nil {
		return errorEmbed("Format response API tidak valid")
	}

	overallStatus, _ := result["status"].(string)
	emoji := "✅"
	color := 3066993 // Green (#2ecc71)
	if overallStatus != "ok" {
		emoji = "⚠️"
		color = 15105570 // Orange (#e67e22)
	}

	fields := []*discordgo.MessageEmbedField{}
	if services, ok := result["services"].(map[string]any); ok {
		for k, v := range services {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   strings.ToUpper(k),
				Value:  fmt.Sprintf("%v", v),
				Inline: true,
			})
		}
	}

	var descAlerts string
	if alerts, ok := result["alerts"].([]any); ok && len(alerts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n**Alerts Terdeteksi:**\n")
		for _, a := range alerts {
			sb.WriteString(fmt.Sprintf("⚠️ %v\n", a))
		}
		descAlerts = sb.String()
	}

	return &discordgo.MessageEmbed{
		Title:       fmt.Sprintf("%s Status Kesehatan Sistem: %s", emoji, strings.ToUpper(overallStatus)),
		Description: descAlerts + "\n\nPage 1/1",
		Color:       color,
		Fields:      fields,
	}
}

func buildSesiInteractiveEmbed(subcmd string, offset int, limit int) (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	if limit <= 0 {
		limit = 10
	}

	var embed *discordgo.MessageEmbed
	var components []discordgo.MessageComponent

	switch subcmd {
	case "ringkasan":
		summary, err := querySesiSummary()
		if err != nil {
			return errorEmbed("Gagal membaca summary sesi: " + err.Error()), nil
		}
		embed = &discordgo.MessageEmbed{
			Title: "📊 Ringkasan Sesi PPPoE",
			Description: fmt.Sprintf(
				"**1. Total Pelanggan Aktif**\n`%d Pelanggan` aktif (non-suspend) dalam database\n\n"+
					"**2. Sesi Aktif (Online)**\n`%d Pelanggan` memiliki sesi PPPoE aktif (online)\n\n"+
					"**3. Sesi Mati (Offline)**\n`%d Pelanggan` memiliki sesi PPPoE yang sedang mati\n\n"+
					"Gunakan `/sesi aktif` atau `/sesi mati` untuk melihat rincian.",
				summary.TotalActive, summary.Online, summary.Offline),
			Color: 0x5865F2, // Rythm Blue
		}

	case "aktif", "mati":
		sesi, err := querySesi(subcmd, offset, limit)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal membaca daftar sesi %s: %s", subcmd, err.Error())), nil
		}

		title := "🟢 Daftar Sesi Aktif (Online)"
		descStr := "Menampilkan sesi PPPoE pelanggan yang sedang online."
		if subcmd == "mati" {
			title = "🔴 Daftar Sesi Mati (Offline)"
			descStr = "Menampilkan sesi PPPoE pelanggan yang sedang offline."
		}

		if len(sesi) == 0 && offset == 0 {
			desc := "Tidak ada sesi " + subcmd + " saat ini."
			embed = &discordgo.MessageEmbed{
				Title:       title,
				Description: desc + "\n\n • ISP Hub",
				Color:       0x2ECC71, // Green
			}
			return embed, components
		}

		var sb strings.Builder
		sb.WriteString(descStr)
		sb.WriteString("\n\n")

		for idx, s := range sesi {
			num := offset + idx + 1
			waktu := s.PppoeUptime
			if subcmd == "mati" {
				waktu = s.LastSyncAt
			}
			if waktu == "" {
				waktu = "N/A"
			}
			sb.WriteString(fmt.Sprintf("**%d. %s** (User: %s)\nStatus: **%s** • Uptime/Sync: %s\n\n", num, s.Name, s.UserPPPoE, s.Status, waktu))
		}

		sb.WriteString(fmt.Sprintf("Page %d • Showing %d results on this page", (offset/limit)+1, len(sesi)))

		embed = &discordgo.MessageEmbed{
			Title:       fmt.Sprintf("%s (Hal %d)", title, (offset/limit)+1),
			Description: strings.TrimSpace(sb.String()),
			Color:       0x5865F2, // Rythm Blue
		}

		btnPrev := discordgo.Button{
			Label:    "＜ Prev",
			Style:    discordgo.SecondaryButton,
			CustomID: fmt.Sprintf("sesi_prev_%s_%d_%d", subcmd, limit, offset),
			Disabled: offset == 0,
		}
		btnNext := discordgo.Button{
			Label:    "Next ＞",
			Style:    discordgo.SecondaryButton,
			CustomID: fmt.Sprintf("sesi_next_%s_%d_%d", subcmd, limit, offset),
			Disabled: len(sesi) < limit,
		}

		row := discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{btnPrev, btnNext},
		}
		components = append(components, row)
	}

	return embed, components
}

func buildTagihanInteractiveEmbed(limit int, periode string, offset int) (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	if limit <= 0 {
		limit = 5
	}
	bills, err := queryUnpaidBillsOffset(limit, periode, offset)
	if err != nil {
		return errorEmbed("Gagal membaca tagihan: " + err.Error()), nil
	}

	title := "📋 Daftar Tagihan Belum Bayar"
	if periode != "" {
		title = "📋 Daftar Tagihan Belum Bayar — Periode " + periode
	}

	row1 := buildRythmTabs("tagihan")
	row2 := buildRythmRow2("tagihan", fmt.Sprintf("tagihan_page_%d_%s_%d", limit, periode, offset))

	if len(bills) == 0 && offset == 0 {
		desc := "Tidak ada tagihan belum bayar saat ini. Semua tagihan sudah lunas! 🎉"
		if periode != "" {
			desc = "Tidak ada tagihan belum bayar untuk periode " + periode
		}
		embed := &discordgo.MessageEmbed{
			Title:       title,
			Description: desc + "\n\n • ISP Hub",
			Color:       0x2ECC71, // Green
		}
		return embed, []discordgo.MessageComponent{row1, row2}
	}

	var sb strings.Builder
	var payButtons []discordgo.MessageComponent

	for idx, b := range bills {
		num := idx + 1
		sb.WriteString(fmt.Sprintf("**%d. Invoice #%s (%s)**\nPelanggan: **%s** • Nominal: **Rp %s** • JT: %s\n\n", num, b.InvoiceNumber, b.Period, b.CustomerName, formatRupiah(b.Amount), b.DueDate))

		payButtons = append(payButtons, discordgo.Button{
			Label:    fmt.Sprintf("💳 %d", num),
			Style:    discordgo.SuccessButton,
			CustomID: fmt.Sprintf("tagihan_pay_%d_%d_%s_%d", b.ID, limit, periode, offset),
		})
	}

	sb.WriteString(fmt.Sprintf("Page %d • Showing %d results on this page", (offset/limit)+1, len(bills)))

	embed := &discordgo.MessageEmbed{
		Title:       fmt.Sprintf("%s (Hal %d)", title, (offset/limit)+1),
		Description: strings.TrimSpace(sb.String()),
		Color:       0x5865F2, // Rythm Blue
	}

	btnPrev := discordgo.Button{
		Label:    "＜ Prev",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("tagihan_prev_%d_%s_%d", limit, periode, offset),
		Disabled: offset == 0,
	}
	btnNext := discordgo.Button{
		Label:    "Next ＞",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("tagihan_next_%d_%s_%d", limit, periode, offset),
		Disabled: len(bills) < limit,
	}
	btnWAAll := discordgo.Button{
		Label:    "📲 WA Reminder (Halaman Ini)",
		Style:    discordgo.PrimaryButton,
		CustomID: fmt.Sprintf("tagihan_waall_%d_%s_%d", limit, periode, offset),
	}

	row3 := discordgo.ActionsRow{Components: payButtons}
	row4 := discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{btnPrev, btnNext, btnWAAll},
	}

	var selectOptions []discordgo.SelectMenuOption
	for idx, b := range bills {
		selectOptions = append(selectOptions, discordgo.SelectMenuOption{
			Label:       fmt.Sprintf("%d. Inv %s — Rp %s", idx+1, b.InvoiceNumber, formatRupiah(b.Amount)),
			Description: fmt.Sprintf("%s (JT: %s)", b.CustomerName, b.DueDate),
			Value:       fmt.Sprintf("%d_%d_%s_%d", b.ID, limit, periode, offset),
		})
	}

	components := []discordgo.MessageComponent{row1, row2}
	if len(payButtons) > 0 {
		components = append(components, row3)
	}
	components = append(components, row4)

	if len(selectOptions) > 0 && len(selectOptions) <= 25 {
		selectMenu := discordgo.SelectMenu{
			CustomID:    fmt.Sprintf("tagihan_actmenu_%d_%s_%d", limit, periode, offset),
			Placeholder: "🎛️ Open Tagihan Controls (WA/Perpanjang/Detail)...",
			Options:     selectOptions,
		}
		components = append(components, discordgo.ActionsRow{Components: []discordgo.MessageComponent{selectMenu}})
	}

	return embed, components
}

// ─── Discord Components V2 Definitions ────────────────────────────────────────

func buildPelangganEmbed(name string, offset int) (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	limit := 5
	customers, err := queryCustomers(name, offset, limit)
	if err != nil {
		return errorEmbed("Gagal membaca pelanggan: " + err.Error()), nil
	}

	row1 := buildRythmTabs("pelanggan")
	row2 := buildRythmRow2("pelanggan", fmt.Sprintf("pelanggan_refresh_%s_%d", url.QueryEscape(name), offset))

	if len(customers) == 0 {
		desc := fmt.Sprintf("Tidak ada pelanggan dengan nama **%s** pada halaman ini.", name)
		if name == "" {
			desc = "Tidak ada pelanggan terdaftar di sistem."
		}
		embed := &discordgo.MessageEmbed{
			Title:       "👥 Daftar Pelanggan",
			Description: desc + "\n\n • ISP Hub",
			Color:       0x5865F2, // Rythm Blue
		}
		return embed, []discordgo.MessageComponent{row1, row2}
	}

	var sb strings.Builder
	var custButtons []discordgo.MessageComponent

	for idx, c := range customers {
		num := idx + 1
		statusEmoji := "🟢 Aktif"
		switch c.Status {
		case "limit":
			statusEmoji = "🟡 Isolir"
		case "inactive":
			statusEmoji = "🔴 Nonaktif"
		}
		sb.WriteString(fmt.Sprintf("**%d. %s (%s)**\nPaket: %s • WA: %s • Tgl Jatuh Tempo: %d\n\n", num, c.Name, statusEmoji, c.PackageName, c.Whatsapp, c.DueDay))

		custButtons = append(custButtons, discordgo.Button{
			Label:    fmt.Sprintf("👤 %d", num),
			Style:    discordgo.SecondaryButton,
			CustomID: fmt.Sprintf("pelanggan_view_%d_%s_%d", c.ID, url.QueryEscape(name), offset),
		})
	}

	sb.WriteString(fmt.Sprintf("Page %d • Showing %d results on this page", (offset/limit)+1, len(customers)))

	embed := &discordgo.MessageEmbed{
		Title:       "👥 Daftar Pelanggan & Status Layanan",
		Description: strings.TrimSpace(sb.String()),
		Color:       0x5865F2, // Rythm Blue
	}

	row3 := discordgo.ActionsRow{Components: custButtons}

	btnPrev := discordgo.Button{
		Label:    "＜ Prev",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_prev_%s_%d", url.QueryEscape(name), offset),
		Disabled: offset == 0,
	}
	btnNext := discordgo.Button{
		Label:    "Next ＞",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_next_%s_%d", url.QueryEscape(name), offset),
		Disabled: len(customers) < limit,
	}

	row4 := discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{btnPrev, btnNext},
	}

	components := []discordgo.MessageComponent{row1, row2}
	if len(custButtons) > 0 {
		components = append(components, row3)
	}
	components = append(components, row4)

	return embed, components
}

func buildPelangganDetailEmbed(customerID int64, name string, offset int) (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	cust, err := customersSvc.FindByID(context.Background(), customerID)
	if err != nil {
		return errorEmbed("Gagal memuat detail pelanggan."), nil
	}

	statusLabel := "Aktif 🟢"
	color := 3066993 // Green (#2ecc71)
	switch cust.Status {
	case "limit":
		statusLabel = "Terisolir/Limit 🟡"
		color = 15105570 // Orange (#e67e22)
	case "inactive":
		statusLabel = "Nonaktif (DHCP Only) 🔴"
		color = 15158332 // Red (#e74c3c)
	}

	valOrDash := func(s string) string {
		if s == "" {
			return "-"
		}
		return s
	}

	embed := &discordgo.MessageEmbed{
		Title: fmt.Sprintf("📄 Detail Pelanggan: %s", cust.Name),
		Color: color,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "ID Pelanggan", Value: fmt.Sprintf("%d", cust.ID), Inline: true},
			{Name: "Status", Value: statusLabel, Inline: true},
			{Name: "Nomor WhatsApp", Value: valOrDash(cust.WhatsApp), Inline: true},
			{Name: "Alamat", Value: valOrDash(cust.Address), Inline: false},
			{Name: "Jatuh Tempo", Value: fmt.Sprintf("Tgl %d tiap bulan", cust.DueDay), Inline: true},
			{Name: "User PPPoE", Value: valOrDash(cust.UserPPPoE), Inline: true},
			{Name: "IP Router (PPPoE)", Value: valOrDash(cust.PppoeIP), Inline: true},
			{Name: "SN ONT", Value: valOrDash(cust.SNOnt), Inline: true},
			{Name: "Redaman ONT", Value: fmt.Sprintf("Rx: `%s` / Tx: `%s`", valOrDash(cust.OntRxPower), valOrDash(cust.OntTxPower)), Inline: false},
		},
	}

	currentPeriod := time.Now().Format("2006-01")
	if bill, billErr := billingSvc.FindByCustomerAndPeriod(context.Background(), customerID, currentPeriod); billErr == nil && bill.ID != 0 {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:   fmt.Sprintf("Tagihan Bulan Ini (%s)", currentPeriod),
			Value:  fmt.Sprintf("No: `%s` | Rp %s (`%s`)", bill.InvoiceNumber, formatRupiah(float64(bill.Amount)), bill.DisplayStatus),
			Inline: false,
		})
	} else {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:   fmt.Sprintf("Tagihan Bulan Ini (%s)", currentPeriod),
			Value:  "Belum Dibuat ⚪",
			Inline: false,
		})
	}

	btnOnt := discordgo.Button{
		Label:    "📡 Status ONT",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_act_ont_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}
	btnSync := discordgo.Button{
		Label:    "🔄 Sync Router",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_act_sync_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}
	btnReboot := discordgo.Button{
		Label:    "⚡ Reboot ONT",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_act_reboot_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}
	btnKick := discordgo.Button{
		Label:    "👢 Kick Session",
		Style:    discordgo.SecondaryButton,
		CustomID: fmt.Sprintf("pelanggan_act_kick_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}

	selectStatus := discordgo.SelectMenu{
		CustomID:    fmt.Sprintf("pelanggan_act_statusmenu_%d_%s_%d", customerID, url.QueryEscape(name), offset),
		Placeholder: "Ubah Status Layanan...",
		Options: []discordgo.SelectMenuOption{
			{Label: "Aktif 🟢", Value: "active"},
			{Label: "Terisolir/Limit 🟡", Value: "limit"},
			{Label: "Nonaktif (DHCP Only) 🔴", Value: "inactive"},
		},
	}

	btnGenBill := discordgo.Button{
		Label:    "💰 Buat Tagihan",
		Style:    discordgo.SuccessButton,
		CustomID: fmt.Sprintf("pelanggan_act_genbill_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}

	btnPayBill := discordgo.Button{
		Label:    "💳 Bayar Lunas",
		Style:    discordgo.PrimaryButton,
		CustomID: fmt.Sprintf("pelanggan_act_paybill_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}

	btnBack := discordgo.Button{
		Label:    "❌ Kembali ke Daftar",
		Style:    discordgo.DangerButton,
		CustomID: fmt.Sprintf("pelanggan_back_%s_%d", url.QueryEscape(name), offset),
	}

	components := []discordgo.MessageComponent{
		discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnOnt, btnSync, btnReboot, btnKick}},
		discordgo.ActionsRow{Components: []discordgo.MessageComponent{selectStatus}},
		discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnGenBill, btnPayBill, btnBack}},
	}

	return embed, components
}

func buildActionResult(embed *discordgo.MessageEmbed, customerID int64, name string, offset int) (*discordgo.MessageEmbed, []discordgo.MessageComponent) {
	btnBack := discordgo.Button{
		Label:    "❌ Kembali",
		Style:    discordgo.DangerButton,
		CustomID: fmt.Sprintf("pelanggan_view_%d_%s_%d", customerID, url.QueryEscape(name), offset),
	}
	return embed, []discordgo.MessageComponent{
		discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnBack}},
	}
}

func runCustomerAction(action string, customerID int64, initiator string) *discordgo.MessageEmbed {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := customersSvc.FindByID(ctx, customerID)
	if err != nil {
		return errorEmbed("Pelanggan tidak ditemukan")
	}

	switch action {
	case "paybill":
		period := time.Now().Format("2006-01")
		bill, err := billingSvc.FindByCustomerAndPeriod(ctx, customerID, period)
		if err != nil || bill.ID == 0 {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** belum memiliki tagihan untuk periode **%s**. Silakan klik **[💰 Buat Tagihan]** terlebih dahulu.", cust.Name, period))
		}
		if bill.Status == "paid" {
			return errorEmbed(fmt.Sprintf("Tagihan periode **%s** untuk pelanggan **%s** sudah lunas sebelumnya.", period, cust.Name))
		}
		err = billingSvc.MarkPaid(ctx, bill.ID, "cash", 0)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal menandai lunas tagihan ID %d: %v", bill.ID, err))
		}
		_ = auditSvc.Record(ctx, nil, nil, "discord.customer_paybill", fmt.Sprintf("User %s marked bill ID %d (%s) paid via Discord bot", initiator, bill.ID, bill.InvoiceNumber))
		return successEmbed("Tagihan Lunas", fmt.Sprintf("Berhasil menandai lunas tagihan periode **%s** (No. %s, Rp %s) untuk pelanggan **%s**.", period, bill.InvoiceNumber, formatRupiah(float64(bill.Amount)), cust.Name))

	case "genbill":
		period := time.Now().Format("2006-01")
		bill, created, err := billingSvc.EnsureBillForCustomer(ctx, customerID, period)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal membuat tagihan periode %s untuk pelanggan **%s**: %v", period, cust.Name, err))
		}
		if bill.ID == 0 {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memenuhi syarat untuk pembuatan tagihan otomatis periode %s (contoh: masa trial belum habis atau status nonaktif).", cust.Name, period))
		}
		_ = auditSvc.Record(ctx, nil, nil, "discord.customer_genbill", fmt.Sprintf("User %s generated bill ID %d (%s) for customer %s via Discord bot", initiator, bill.ID, bill.InvoiceNumber, cust.Name))
		if !created {
			return &discordgo.MessageEmbed{
				Title:       "ℹ️ Tagihan Sudah Ada",
				Description: fmt.Sprintf("Tagihan periode **%s** untuk pelanggan **%s** sudah dibuat sebelumnya.", period, cust.Name),
				Color:       3447003, // Blue (#3498db)
				Fields: []*discordgo.MessageEmbedField{
					{Name: "Nomor Invoice", Value: bill.InvoiceNumber, Inline: true},
					{Name: "Nominal", Value: fmt.Sprintf("Rp %s", formatRupiah(float64(bill.Amount))), Inline: true},
					{Name: "Status Tagihan", Value: bill.DisplayStatus, Inline: true},
					{Name: "Jatuh Tempo", Value: bill.DueDate, Inline: true},
				},
			}
		}
		return &discordgo.MessageEmbed{
			Title:       "✅ Tagihan Berhasil Dibuat",
			Description: fmt.Sprintf("Tagihan baru periode **%s** berhasil dibuat untuk pelanggan **%s**.", period, cust.Name),
			Color:       3066993, // Green (#2ecc71)
			Fields: []*discordgo.MessageEmbedField{
				{Name: "Nomor Invoice", Value: bill.InvoiceNumber, Inline: true},
				{Name: "Nominal", Value: fmt.Sprintf("Rp %s", formatRupiah(float64(bill.Amount))), Inline: true},
				{Name: "Status Tagihan", Value: bill.DisplayStatus, Inline: true},
				{Name: "Jatuh Tempo", Value: bill.DueDate, Inline: true},
			},
		}

	case "reboot":
		if strings.TrimSpace(cust.SNOnt) == "" {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name))
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
			return errorEmbed(fmt.Sprintf("Gagal mengirim perintah reboot untuk ONT **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err))
		}
		_ = auditSvc.Record(ctx, nil, nil, "discord.ont_reboot", fmt.Sprintf("User %s rebooted ONT for customer %s (SN: %s) via Discord bot", initiator, cust.Name, cust.SNOnt))
		return successEmbed("Reboot Terkirim", fmt.Sprintf("Perintah reboot berhasil dikirim ke GenieACS untuk pelanggan **%s** (SN: %s). ONT akan segera dimuat ulang.", cust.Name, cust.SNOnt))

	case "sync":
		if strings.TrimSpace(cust.UserPPPoE) == "" {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name))
		}
		err = customersSvc.SyncToMikrotik(ctx, cust)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal melakukan sinkronisasi credentials pelanggan **%s** ke MikroTik: %v", cust.Name, err))
		}
		_ = auditSvc.Record(ctx, nil, nil, "discord.customer_sync", fmt.Sprintf("User %s synced customer %s to MikroTik via Discord bot", initiator, cust.Name))
		return successEmbed("Sinkronisasi Berhasil", fmt.Sprintf("Berhasil mensinkronkan PPPoE credentials pelanggan **%s** (User: %s) ke MikroTik.", cust.Name, cust.UserPPPoE))

	case "kick":
		if strings.TrimSpace(cust.UserPPPoE) == "" {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name))
		}
		mikrotikHost, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikHost)
		mikrotikUser, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikUser)
		mikrotikPass, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikPass)
		if strings.TrimSpace(mikrotikHost) == "" || strings.TrimSpace(mikrotikUser) == "" {
			return errorEmbed("MikroTik host atau user belum terkonfigurasi di pengaturan sistem.")
		}
		client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
		if err := client.Connect(ctx); err != nil {
			return errorEmbed(fmt.Sprintf("Gagal terhubung ke MikroTik: %v", err))
		}
		defer client.Close()

		err = client.KickUser(ctx, cust.UserPPPoE)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal memutuskan sesi aktif PPPoE pelanggan **%s** (User: %s) di MikroTik: %v", cust.Name, cust.UserPPPoE, err))
		}
		_ = auditSvc.Record(ctx, nil, nil, "discord.customer_kick", fmt.Sprintf("User %s kicked active PPPoE session for customer %s (User: %s) via Discord bot", initiator, cust.Name, cust.UserPPPoE))
		return successEmbed("Sesi Diputuskan", fmt.Sprintf("Sesi aktif PPPoE pelanggan **%s** (User: %s) berhasil diputuskan (kick) di MikroTik.", cust.Name, cust.UserPPPoE))

	case "ont":
		if strings.TrimSpace(cust.SNOnt) == "" {
			return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name))
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
			return errorEmbed(fmt.Sprintf("Gagal mengambil status ONT dari GenieACS untuk pelanggan **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err))
		}
		statusEmoji := "ONLINE 🟢"
		color := 3066993 // Green (#2ecc71)
		if status.Status == "offline" {
			statusEmoji = "OFFLINE 🔴"
			color = 15158332 // Red (#e74c3c)
		}
		return &discordgo.MessageEmbed{
			Title: "📡 Detail Status ONT Pelanggan",
			Color: color,
			Fields: []*discordgo.MessageEmbedField{
				{Name: "Nama Pelanggan", Value: cust.Name, Inline: true},
				{Name: "User PPPoE", Value: cust.UserPPPoE, Inline: true},
				{Name: "Model ONT", Value: status.Model, Inline: true},
				{Name: "Serial Number", Value: fmt.Sprintf("`%s`", status.SerialNumber), Inline: true},
				{Name: "IP Address", Value: status.IPAddress, Inline: true},
				{Name: "Uptime ONT", Value: status.Uptime, Inline: true},
				{Name: "Redaman (Rx Optical)", Value: fmt.Sprintf("`%s` (Tx: `%s`)", status.RxOpticalPower, status.TxOpticalPower), Inline: false},
				{Name: "Status Koneksi", Value: statusEmoji, Inline: true},
				{Name: "Last Inform", Value: status.LastInformTime.Format("2006-01-02 15:04:05"), Inline: true},
			},
		}
	}

	return errorEmbed("Action tidak dikenal")
}

func handleComponentInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.MessageComponentData()

	if data.CustomID == "dash_close" {
		_ = s.ChannelMessageDelete(i.ChannelID, i.Message.ID)
		return
	}

	if strings.HasPrefix(data.CustomID, "tab_") || strings.HasPrefix(data.CustomID, "dash_") || strings.HasPrefix(data.CustomID, "refresh_") || data.CustomID == "health_refresh_data" {
		var embed *discordgo.MessageEmbed
		var components []discordgo.MessageComponent
		switch data.CustomID {
		case "tab_dashboard", "refresh_dashboard", "dash_refresh":
			embed, components = buildDashboardEmbed()
		case "tab_health", "dash_shortcut_health", "refresh_health", "health_refresh_data":
			embed = buildHealthEmbed()
			btnBack := discordgo.Button{
				Label:    "⬅️ Kembali ke Dashboard",
				Style:    discordgo.PrimaryButton,
				CustomID: "refresh_dashboard",
			}
			components = []discordgo.MessageComponent{
				buildRythmTabs("health"),
				discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnBack}},
			}
		case "tab_pelanggan", "dash_shortcut_pelanggan":
			embed, components = buildPelangganEmbed("", 0)
		case "tab_tagihan", "dash_shortcut_tagihan":
			embed, components = buildTagihanInteractiveEmbed(5, "", 0)
		}
		if embed != nil {
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseUpdateMessage,
				Data: &discordgo.InteractionResponseData{
					Embeds:     []*discordgo.MessageEmbed{embed},
					Components: components,
				},
			})
		}
		return
	}

	if strings.HasPrefix(data.CustomID, "sesi_") {
		parts := strings.Split(data.CustomID, "_")
		if len(parts) >= 5 && (parts[1] == "prev" || parts[1] == "next") {
			subcmd := parts[2]
			limit := 10
			fmt.Sscanf(parts[3], "%d", &limit)
			offset := 0
			fmt.Sscanf(parts[4], "%d", &offset)

			switch parts[1] {
			case "prev":
				offset -= limit
				if offset < 0 {
					offset = 0
				}
			case "next":
				offset += limit
			}

			embed, components := buildSesiInteractiveEmbed(subcmd, offset, limit)
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseUpdateMessage,
				Data: &discordgo.InteractionResponseData{
					Embeds:     []*discordgo.MessageEmbed{embed},
					Components: components,
				},
			})
			return
		}
	}

	if strings.HasPrefix(data.CustomID, "tagihan_") {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		parts := strings.Split(data.CustomID, "_")
		if len(parts) >= 5 && (parts[1] == "prev" || parts[1] == "next" || parts[1] == "page") {
			limit := 10
			fmt.Sscanf(parts[2], "%d", &limit)
			periode := parts[3]
			offset := 0
			fmt.Sscanf(parts[4], "%d", &offset)

			switch parts[1] {
			case "prev":
				offset -= limit
				if offset < 0 {
					offset = 0
				}
			case "next":
				offset += limit
			}

			embed, components := buildTagihanInteractiveEmbed(limit, periode, offset)
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseUpdateMessage,
				Data: &discordgo.InteractionResponseData{
					Embeds:     []*discordgo.MessageEmbed{embed},
					Components: components,
				},
			})
			return
		}

		if parts[1] == "actmenu" && len(data.Values) > 0 {
			valParts := strings.Split(data.Values[0], "_")
			if len(valParts) >= 4 {
				billID := int64(0)
				fmt.Sscanf(valParts[0], "%d", &billID)
				limit := 10
				fmt.Sscanf(valParts[1], "%d", &limit)
				periode := valParts[2]
				offset := 0
				fmt.Sscanf(valParts[3], "%d", &offset)

				bill, err := billingSvc.FindByID(ctx, billID)
				if err != nil {
					return
				}

				embed := &discordgo.MessageEmbed{
					Title:       fmt.Sprintf("⚡ Aksi Cepat Tagihan #%s", bill.InvoiceNumber),
					Description: fmt.Sprintf("Pelanggan: **%s**\nPeriode: %s\nNominal: **Rp %s**\nJatuh Tempo: %s", bill.CustomerName, bill.Period, formatRupiah(float64(bill.Amount)), bill.DueDate),
					Color:       3447003,
				}

				btnPay := discordgo.Button{
					Label:    "✅ Tandai Lunas",
					Style:    discordgo.SuccessButton,
					CustomID: fmt.Sprintf("tagihan_pay_%d_%d_%s_%d", bill.ID, limit, periode, offset),
				}
				btnWA := discordgo.Button{
					Label:    "📲 Kirim WA Notif",
					Style:    discordgo.PrimaryButton,
					CustomID: fmt.Sprintf("tagihan_wa_%d_%d_%s_%d", bill.ID, limit, periode, offset),
				}
				btnExtend := discordgo.Button{
					Label:    "⏳ Perpanjang (+3 Hari)",
					Style:    discordgo.SecondaryButton,
					CustomID: fmt.Sprintf("tagihan_extend_%d_%d_%s_%d", bill.ID, limit, periode, offset),
				}
				btnBack := discordgo.Button{
					Label:    "❌ Kembali ke Daftar",
					Style:    discordgo.DangerButton,
					CustomID: fmt.Sprintf("tagihan_page_%d_%s_%d", limit, periode, offset),
				}

				components := []discordgo.MessageComponent{
					discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnPay, btnWA, btnExtend}},
					discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnBack}},
				}

				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseUpdateMessage,
					Data: &discordgo.InteractionResponseData{
						Embeds:     []*discordgo.MessageEmbed{embed},
						Components: components,
					},
				})
			}
			return
		}

		if parts[1] == "waall" && len(parts) >= 6 {
			limit := 5
			fmt.Sscanf(parts[2], "%d", &limit)
			periode := parts[3]
			offset := 0
			fmt.Sscanf(parts[4], "%d", &offset)

			bills, _ := queryUnpaidBillsOffset(limit, periode, offset)
			sentCount := 0
			for _, b := range bills {
				if err := billingSvc.SendManualNotification(ctx, b.ID, "tagihan-h7"); err == nil {
					sentCount++
				}
			}
			discordUser := getDiscordUser(i)
			_ = auditSvc.Record(ctx, nil, nil, "discord.tagihan_waall", fmt.Sprintf("User %s sent bulk WA notification to %d bills via Discord bot", discordUser, sentCount))

			embed, components := buildTagihanInteractiveEmbed(limit, periode, offset)
			embed.Description = fmt.Sprintf("✅ **Berhasil mengirim %d notifikasi WhatsApp untuk halaman ini!**\n\n%s", sentCount, embed.Description)
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseUpdateMessage,
				Data: &discordgo.InteractionResponseData{
					Embeds:     []*discordgo.MessageEmbed{embed},
					Components: components,
				},
			})
			return
		}

		if len(parts) >= 6 && (parts[1] == "pay" || parts[1] == "wa" || parts[1] == "extend") {
			billID := int64(0)
			fmt.Sscanf(parts[2], "%d", &billID)
			limit := 10
			fmt.Sscanf(parts[3], "%d", &limit)
			periode := parts[4]
			offset := 0
			fmt.Sscanf(parts[5], "%d", &offset)

			discordUser := getDiscordUser(i)
			var actionResultEmbed *discordgo.MessageEmbed
			switch parts[1] {
			case "pay":
				err := billingSvc.MarkPaid(ctx, billID, "cash", 0)
				if err != nil {
					actionResultEmbed = errorEmbed(fmt.Sprintf("Gagal menandai lunas tagihan ID %d: %v", billID, err))
				} else {
					_ = auditSvc.Record(ctx, nil, nil, "discord.tagihan_pay", fmt.Sprintf("User %s marked bill ID %d paid via Discord bot", discordUser, billID))
					actionResultEmbed = successEmbed("Tagihan Lunas", fmt.Sprintf("Berhasil menandai lunas tagihan ID %d.", billID))
				}
			case "wa":
				err := billingSvc.SendManualNotification(ctx, billID, "tagihan-h7")
				if err != nil {
					actionResultEmbed = errorEmbed(fmt.Sprintf("Gagal mengirim WA untuk tagihan ID %d: %v", billID, err))
				} else {
					_ = auditSvc.Record(ctx, nil, nil, "discord.tagihan_wa", fmt.Sprintf("User %s sent manual WA notification for bill ID %d via Discord bot", discordUser, billID))
					actionResultEmbed = successEmbed("Notifikasi Terkirim", fmt.Sprintf("Pesan WhatsApp berhasil dikirim untuk tagihan ID %d.", billID))
				}
			case "extend":
				err := billingSvc.GrantExtension(ctx, billID)
				if err != nil {
					actionResultEmbed = errorEmbed(fmt.Sprintf("Gagal memperpanjang masa aktif tagihan ID %d: %v", billID, err))
				} else {
					_ = auditSvc.Record(ctx, nil, nil, "discord.tagihan_extend", fmt.Sprintf("User %s extended due date for bill ID %d via Discord bot", discordUser, billID))
					actionResultEmbed = successEmbed("Jatuh Tempo Diperpanjang", fmt.Sprintf("Berhasil memperpanjang jatuh tempo (+3 hari) untuk tagihan ID %d dan membuka blokir sementara di MikroTik.", billID))
				}
			}

			btnBack := discordgo.Button{
				Label:    "⬅️ Kembali ke Daftar Tagihan",
				Style:    discordgo.PrimaryButton,
				CustomID: fmt.Sprintf("tagihan_page_%d_%s_%d", limit, periode, offset),
			}
			resComponents := []discordgo.MessageComponent{discordgo.ActionsRow{Components: []discordgo.MessageComponent{btnBack}}}
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseUpdateMessage,
				Data: &discordgo.InteractionResponseData{
					Embeds:     []*discordgo.MessageEmbed{actionResultEmbed},
					Components: resComponents,
				},
			})
			return
		}
	}

	if strings.HasPrefix(data.CustomID, "pelanggan_") {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		parts := strings.Split(data.CustomID, "_")
		if len(parts) < 2 {
			return
		}

		// 1. Prev / Next / Refresh List
		if parts[1] == "prev" || parts[1] == "next" || parts[1] == "refresh" {
			if len(parts) >= 4 {
				name, _ := url.QueryUnescape(parts[2])
				offset := 0
				fmt.Sscanf(parts[3], "%d", &offset)

				switch parts[1] {
				case "prev":
					offset -= 5
				case "next":
					offset += 5
				}
				if offset < 0 {
					offset = 0
				}

				embed, components := buildPelangganEmbed(name, offset)
				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseUpdateMessage,
					Data: &discordgo.InteractionResponseData{
						Embeds:     []*discordgo.MessageEmbed{embed},
						Components: components,
					},
				})
			}
			return
		}

		// 2. Back to List
		if parts[1] == "back" {
			if len(parts) >= 4 {
				name, _ := url.QueryUnescape(parts[2])
				offset := 0
				fmt.Sscanf(parts[3], "%d", &offset)

				embed, components := buildPelangganEmbed(name, offset)
				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseUpdateMessage,
					Data: &discordgo.InteractionResponseData{
						Embeds:     []*discordgo.MessageEmbed{embed},
						Components: components,
					},
				})
			}
			return
		}

		// 3. View Customer Detail
		if parts[1] == "view" || parts[1] == "add" {
			if len(parts) >= 5 {
				custID := int64(0)
				fmt.Sscanf(parts[2], "%d", &custID)
				name, _ := url.QueryUnescape(parts[3])
				offset := 0
				fmt.Sscanf(parts[4], "%d", &offset)

				embed, components := buildPelangganDetailEmbed(custID, name, offset)
				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseUpdateMessage,
					Data: &discordgo.InteractionResponseData{
						Embeds:     []*discordgo.MessageEmbed{embed},
						Components: components,
					},
				})
			}
			return
		}

		// 4. Update Status Menu (Select Menu)
		if parts[1] == "act" && parts[2] == "statusmenu" {
			if len(parts) >= 6 && len(data.Values) > 0 {
				custID := int64(0)
				fmt.Sscanf(parts[3], "%d", &custID)
				name, _ := url.QueryUnescape(parts[4])
				offset := 0
				fmt.Sscanf(parts[5], "%d", &offset)
				selectedStatus := data.Values[0]

				// Update DB status
				err := customersSvc.UpdateStatus(ctx, custID, selectedStatus)
				var resultEmbed *discordgo.MessageEmbed
				if err != nil {
					resultEmbed = errorEmbed(fmt.Sprintf("Gagal memperbarui status: %v", err))
				} else {
					discordUser := getDiscordUser(i)
					_ = auditSvc.Record(ctx, nil, nil, "discord.customer_update_status", fmt.Sprintf("User %s changed customer ID %d status to %s via Discord bot", discordUser, custID, selectedStatus))
					resultEmbed = successEmbed("Status Diperbarui", fmt.Sprintf("Berhasil mengubah status menjadi **%s**.", selectedStatus))
				}

				resEmbed, resultComponents := buildActionResult(resultEmbed, custID, name, offset)
				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseUpdateMessage,
					Data: &discordgo.InteractionResponseData{
						Embeds:     []*discordgo.MessageEmbed{resEmbed},
						Components: resultComponents,
					},
				})
			}
			return
		}

		// 5. Actions: ont, sync, reboot, kick
		if parts[1] == "act" {
			if len(parts) >= 6 {
				action := parts[2]
				custID := int64(0)
				fmt.Sscanf(parts[3], "%d", &custID)
				name, _ := url.QueryUnescape(parts[4])
				offset := 0
				fmt.Sscanf(parts[5], "%d", &offset)

				// Acknowledge source
				_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
					Type: discordgo.InteractionResponseDeferredMessageUpdate,
				})

				discordUser := getDiscordUser(i)
				actionEmbed := runCustomerAction(action, custID, discordUser)

				resEmbed, resultComponents := buildActionResult(actionEmbed, custID, name, offset)

				_, _ = s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
					Embeds:     &[]*discordgo.MessageEmbed{resEmbed},
					Components: &resultComponents,
				})
			}
			return
		}
	}
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

func errorEmbed(message string) *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Title:       "❌ Error",
		Description: message,
		Color:       15158332, // Red (#e74c3c)
	}
}

func successEmbed(title, message string) *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Title:       "✅ " + title,
		Description: message,
		Color:       3066993, // Green (#2ecc71)
	}
}

// ─── Settings subcommand handlers ─────────────────────────────────────────────

func handlePengaturanCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) *discordgo.MessageEmbed {
	if len(options) == 0 {
		return errorEmbed("Subcommand tidak ditemukan.")
	}
	subCmd := options[0]
	switch subCmd.Name {
	case "lihat":
		var kunci string
		if len(subCmd.Options) > 0 {
			kunci = subCmd.Options[0].StringValue()
		}
		return buildLihatPengaturanEmbed(kunci)
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
			return errorEmbed("Kunci tidak boleh kosong.")
		}
		discordUser := getDiscordUser(i)
		return buildUbahPengaturanEmbed(discordUser, kunci, nilai)
	default:
		return errorEmbed("Subcommand tidak dikenal.")
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

func buildLihatPengaturanEmbed(kunci string) *discordgo.MessageEmbed {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if kunci != "" {
		kunci = strings.TrimSpace(kunci)
		if !settings.IsAllowedKey(kunci) {
			return errorEmbed(fmt.Sprintf("Kunci tidak dikenal: `%s`", kunci))
		}
		val, err := settingsSvc.GetString(ctx, kunci)
		if err != nil {
			return errorEmbed(fmt.Sprintf("Gagal mengambil pengaturan: %s", err.Error()))
		}
		if isSensitiveKey(kunci) && val != "" {
			val = "••••••••"
		}
		return &discordgo.MessageEmbed{
			Title: "⚙️ Pengaturan Sistem",
			Color: 3447003, // Blue
			Fields: []*discordgo.MessageEmbedField{
				{Name: kunci, Value: fmt.Sprintf("`%s`", val), Inline: false},
			},
		}
	}

	all, err := settingsSvc.GetAll(ctx)
	if err != nil {
		return errorEmbed(fmt.Sprintf("Gagal mengambil semua pengaturan: %s", err.Error()))
	}

	var sb strings.Builder
	sb.WriteString("Gunakan `/pengaturan lihat kunci:<nama_kunci>` untuk detail atau `/pengaturan ubah` untuk merubah nilai.\n\n")

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
		line := fmt.Sprintf("• **%s**: `%s`\n", k, val)
		if sb.Len()+len(line) > 3800 {
			sb.WriteString("\n*(dan beberapa pengaturan lainnya...)*")
			break
		}
		sb.WriteString(line)
	}

	return &discordgo.MessageEmbed{
		Title:       "⚙️ Daftar Pengaturan Sistem",
		Description: strings.TrimSpace(sb.String()),
		Color:       3447003, // Blue
	}
}

func buildUbahPengaturanEmbed(discordUser, kunci, nilai string) *discordgo.MessageEmbed {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	kunci = strings.TrimSpace(kunci)
	nilai = strings.TrimSpace(nilai)

	if !settings.IsAllowedKey(kunci) {
		return errorEmbed(fmt.Sprintf("Kunci tidak dikenal: `%s`", kunci))
	}

	if (kunci == "wa_gateway_url" || kunci == settings.KeyDiscordWebhookURL || kunci == settings.KeyACSURL) && nilai != "" {
		if _, err := url.ParseRequestURI(nilai); err != nil {
			return errorEmbed(fmt.Sprintf("URL tidak valid untuk: `%s`", kunci))
		}
	}

	err := settingsSvc.Set(ctx, kunci, nilai)
	if err != nil {
		return errorEmbed(fmt.Sprintf("Gagal mengubah pengaturan: %s", err.Error()))
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

	return successEmbed("Pengaturan Diperbarui", fmt.Sprintf("Berhasil memperbarui pengaturan `%s` menjadi `%s`", kunci, displayValue))
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

func handleRebootCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) *discordgo.MessageEmbed {
	if len(options) == 0 {
		return errorEmbed("Parameter `target` diperlukan.")
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	if strings.TrimSpace(cust.SNOnt) == "" {
		return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name))
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
		return errorEmbed(fmt.Sprintf("Gagal mengirim perintah reboot untuk ONT **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err))
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.ont_reboot", fmt.Sprintf("User %s rebooted ONT for customer %s (SN: %s) via Discord bot", discordUser, cust.Name, cust.SNOnt))

	return successEmbed("Reboot Terkirim", fmt.Sprintf("Perintah reboot berhasil dikirim ke GenieACS untuk pelanggan **%s** (SN: %s). ONT akan segera dimuat ulang.", cust.Name, cust.SNOnt))
}

func handleSyncCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) *discordgo.MessageEmbed {
	if len(options) == 0 {
		return errorEmbed("Parameter `target` diperlukan.")
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	if strings.TrimSpace(cust.UserPPPoE) == "" {
		return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name))
	}

	err = customersSvc.SyncToMikrotik(ctx, cust)
	if err != nil {
		return errorEmbed(fmt.Sprintf("Gagal melakukan sinkronisasi credentials pelanggan **%s** ke MikroTik: %v", cust.Name, err))
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.customer_sync", fmt.Sprintf("User %s synced customer %s to MikroTik via Discord bot", discordUser, cust.Name))

	return successEmbed("Sinkronisasi Berhasil", fmt.Sprintf("Berhasil mensinkronkan PPPoE credentials pelanggan **%s** (User: %s) ke MikroTik.", cust.Name, cust.UserPPPoE))
}

func handleKickCommand(i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) *discordgo.MessageEmbed {
	if len(options) == 0 {
		return errorEmbed("Parameter `target` diperlukan.")
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	if strings.TrimSpace(cust.UserPPPoE) == "" {
		return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki user PPPoE terkonfigurasi.", cust.Name))
	}

	mikrotikHost, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikHost)
	mikrotikUser, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikUser)
	mikrotikPass, _ := settingsSvc.GetString(ctx, settings.KeyMikrotikPass)
	if strings.TrimSpace(mikrotikHost) == "" || strings.TrimSpace(mikrotikUser) == "" {
		return errorEmbed("MikroTik host atau user belum terkonfigurasi di pengaturan sistem.")
	}

	client := mikrotik.NewClient(mikrotikHost, mikrotikUser, mikrotikPass)
	if err := client.Connect(ctx); err != nil {
		return errorEmbed(fmt.Sprintf("Gagal terhubung ke MikroTik: %v", err))
	}
	defer client.Close()

	err = client.KickUser(ctx, cust.UserPPPoE)
	if err != nil {
		return errorEmbed(fmt.Sprintf("Gagal memutuskan sesi aktif PPPoE pelanggan **%s** (User: %s) di MikroTik: %v", cust.Name, cust.UserPPPoE, err))
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.customer_kick", fmt.Sprintf("User %s kicked active PPPoE session for customer %s (User: %s) via Discord bot", discordUser, cust.Name, cust.UserPPPoE))

	return successEmbed("Sesi Diputuskan", fmt.Sprintf("Sesi aktif PPPoE pelanggan **%s** (User: %s) berhasil diputuskan (kick) di MikroTik.", cust.Name, cust.UserPPPoE))
}

func handleOntCommand(_ *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) *discordgo.MessageEmbed {
	if len(options) == 0 {
		return errorEmbed("Parameter `target` diperlukan.")
	}
	target := options[0].StringValue()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	if strings.TrimSpace(cust.SNOnt) == "" {
		return errorEmbed(fmt.Sprintf("Pelanggan **%s** tidak memiliki Serial Number ONT terkonfigurasi.", cust.Name))
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
		return errorEmbed(fmt.Sprintf("Gagal mengambil status ONT dari GenieACS untuk pelanggan **%s** (SN: %s): %v", cust.Name, cust.SNOnt, err))
	}

	statusEmoji := "ONLINE 🟢"
	color := 3066993 // Green (#2ecc71)
	if status.Status == "offline" {
		statusEmoji = "OFFLINE 🔴"
		color = 15158332 // Red (#e74c3c)
	}

	return &discordgo.MessageEmbed{
		Title: "📡 Detail Status ONT Pelanggan",
		Color: color,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Nama Pelanggan", Value: cust.Name, Inline: true},
			{Name: "User PPPoE", Value: cust.UserPPPoE, Inline: true},
			{Name: "Model ONT", Value: status.Model, Inline: true},
			{Name: "Serial Number", Value: fmt.Sprintf("`%s`", status.SerialNumber), Inline: true},
			{Name: "IP Address", Value: status.IPAddress, Inline: true},
			{Name: "Uptime ONT", Value: status.Uptime, Inline: true},
			{Name: "Redaman (Rx Optical)", Value: fmt.Sprintf("`%s` (Tx: `%s`)", status.RxOpticalPower, status.TxOpticalPower), Inline: false},
			{Name: "Status Koneksi", Value: statusEmoji, Inline: true},
			{Name: "Last Inform", Value: status.LastInformTime.Format("2006-01-02 15:04:05"), Inline: true},
		},
	}
}

func handleUbahStatusCommand(i *discordgo.InteractionCreate, target, status string) *discordgo.MessageEmbed {
	if target == "" || status == "" {
		return errorEmbed("Parameter `target` dan `status` diperlukan.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	err = customersSvc.UpdateStatus(ctx, cust.ID, status)
	if err != nil {
		return errorEmbed(fmt.Sprintf("Gagal memperbarui status pelanggan **%s** menjadi **%s**: %v", cust.Name, status, err))
	}

	discordUser := getDiscordUser(i)
	_ = auditSvc.Record(ctx, nil, nil, "discord.customer_update_status", fmt.Sprintf("User %s changed customer %s status to %s via Discord bot", discordUser, cust.Name, status))

	return successEmbed("Status Diperbarui", fmt.Sprintf("Berhasil mengubah status pelanggan **%s** menjadi **%s** dan mensinkronkan ke MikroTik.", cust.Name, status))
}

func handleBuatTagihanCommand(i *discordgo.InteractionCreate, target string) *discordgo.MessageEmbed {
	if target == "" {
		return errorEmbed("Parameter `target` diperlukan.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cust, err := findCustomerByTarget(ctx, target)
	if err != nil {
		return errorEmbed(err.Error())
	}

	discordUser := getDiscordUser(i)
	return runCustomerAction("genbill", cust.ID, discordUser)
}
