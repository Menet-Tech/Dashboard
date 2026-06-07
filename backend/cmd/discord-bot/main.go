package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/bwmarrin/discordgo"
	_ "modernc.org/sqlite"
)

var (
	botToken      = envOrFatal("DISCORD_BOT_TOKEN")
	applicationID = envOrFatal("DISCORD_APPLICATION_ID")
	guildID       = os.Getenv("DISCORD_GUILD_ID") // optional for guild commands
	apiBaseURL    = os.Getenv("API_BASE_URL")      // e.g. http://localhost:8080
	sqlitePath    = envOrDefault("SQLITE_PATH", "../storage/dashboard.db")

	logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	db     *sql.DB
)

func main() {
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}

	var err error
	db, err = sql.Open("sqlite", sqlitePath+"?mode=ro&_journal_mode=WAL")
	if err != nil {
		logger.Error("open db", "error", err)
		os.Exit(1)
	}
	defer db.Close()

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
		if len(cmdData.Options) > 0 {
			limit = int(cmdData.Options[0].IntValue())
		}
		responseContent = buildTagihanMessage(limit)
	case "pelanggan":
		name := ""
		if len(cmdData.Options) > 0 {
			name = cmdData.Options[0].StringValue()
		}
		responseContent = buildPelangganMessage(name)
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

func queryUnpaidBills(limit int) ([]billRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `
		SELECT b.invoice_number, c.nama, b.periode, b.nominal, b.jatuh_tempo
		FROM tagihan b
		JOIN pelanggan c ON c.id = b.pelanggan_id
		WHERE b.status = 'belum_bayar'
		ORDER BY b.jatuh_tempo ASC
		LIMIT ?
	`, limit)
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

func buildTagihanMessage(limit int) string {
	bills, err := queryUnpaidBills(limit)
	if err != nil {
		return "❌ Gagal membaca tagihan: " + err.Error()
	}
	if len(bills) == 0 {
		return "✅ Tidak ada tagihan belum bayar!"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("📋 **%d Tagihan Belum Bayar** (terdekat jatuh tempo):\n", len(bills)))
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
