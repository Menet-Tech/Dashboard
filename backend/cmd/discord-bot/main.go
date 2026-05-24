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

	_ "modernc.org/sqlite"
)

var (
	botToken      = envOrFatal("DISCORD_BOT_TOKEN")
	applicationID = envOrFatal("DISCORD_APPLICATION_ID")
	guildID       = os.Getenv("DISCORD_GUILD_ID") // optional for global commands
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

	if err := registerCommands(); err != nil {
		logger.Error("register commands", "error", err)
		os.Exit(1)
	}

	logger.Info("Discord bot starting, polling interactions...")
	<-ctx.Done()
	logger.Info("Discord bot stopped")
}

// ─── Command registration ────────────────────────────────────────────────────

var slashCommands = []map[string]any{
	{
		"name":        "summary",
		"type":        1,
		"description": "Tampilkan ringkasan dashboard billing ISP",
	},
	{
		"name":        "health",
		"type":        1,
		"description": "Cek status kesehatan sistem",
	},
	{
		"name":        "tagihan",
		"type":        1,
		"description": "Lihat daftar tagihan belum bayar",
		"options": []map[string]any{
			{
				"name":        "limit",
				"description": "Jumlah maksimal tagihan (default 10)",
				"type":        4, // INTEGER
				"required":    false,
			},
		},
	},
	{
		"name":        "pelanggan",
		"type":        1,
		"description": "Cari pelanggan berdasarkan nama",
		"options": []map[string]any{
			{
				"name":        "nama",
				"description": "Nama pelanggan (partial match)",
				"type":        3, // STRING
				"required":    true,
			},
		},
	},
}

func registerCommands() error {
	for _, cmd := range slashCommands {
		url := fmt.Sprintf("https://discord.com/api/v10/applications/%s/guilds/%s/commands", applicationID, guildID)
		if guildID == "" {
			url = fmt.Sprintf("https://discord.com/api/v10/applications/%s/commands", applicationID)
		}

		body, err := json.Marshal(cmd)
		if err != nil {
			logger.Error("marshal command failed", "name", cmd["name"], "error", err)
			return err
		}
		req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(string(body)))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bot "+botToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		resp.Body.Close()

		if resp.StatusCode >= 400 {
			return fmt.Errorf("register command %q: HTTP %d", cmd["name"], resp.StatusCode)
		}
		logger.Info("registered command", "name", cmd["name"])
	}
	return nil
}

// ─── Discord API helpers ─────────────────────────────────────────────────────

func discordRequest(method, path string, payload any) ([]byte, int, error) {
	var bodyStr string
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal discord payload: %w", err)
		}
		bodyStr = string(b)
	}

	req, err := http.NewRequest(method, "https://discord.com/api/v10"+path, strings.NewReader(bodyStr))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bot "+botToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read discord response: %w", err)
	}
	return data, resp.StatusCode, nil
}

// ─── Database queries ─────────────────────────────────────────────────────────

type dashboardSummary struct {
	TotalCustomers    int
	ActiveCustomers   int
	TotalBills        int
	UnpaidBills       int
	PaidBills         int
	UnpaidAmount      float64
}

func querySummary() (dashboardSummary, error) {
	var s dashboardSummary
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM customers`).Scan(&s.TotalCustomers); err != nil {
		return s, fmt.Errorf("count customers: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM customers WHERE status = 'active'`).Scan(&s.ActiveCustomers); err != nil {
		return s, fmt.Errorf("count active customers: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bills`).Scan(&s.TotalBills); err != nil {
		return s, fmt.Errorf("count bills: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(amount),0) FROM bills WHERE status = 'belum_bayar'`).Scan(&s.UnpaidBills, &s.UnpaidAmount); err != nil {
		return s, fmt.Errorf("count unpaid bills: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bills WHERE status = 'lunas'`).Scan(&s.PaidBills); err != nil {
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
		SELECT b.invoice_number, c.name, b.period, b.amount, b.due_date
		FROM bills b
		JOIN customers c ON c.id = b.customer_id
		WHERE b.status = 'belum_bayar'
		ORDER BY b.due_date ASC
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
		SELECT c.name, c.status, COALESCE(p.name,'—'), c.whatsapp, c.due_day
		FROM customers c
		LEFT JOIN packages p ON p.id = c.package_id
		WHERE c.name LIKE ?
		ORDER BY c.name
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
	// Call the local API health endpoint directly
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
