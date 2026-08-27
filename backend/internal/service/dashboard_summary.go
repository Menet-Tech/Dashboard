package service

import (
	"context"
	"database/sql"
	"fmt"
)

type RecentPayment struct {
	ID            int64  `json:"id"`
	InvoiceNumber string `json:"invoice_number"`
	CustomerName  string `json:"customer_name"`
	Amount        int    `json:"amount"`
	PaidAt        string `json:"paid_at"`
	PaymentMethod string `json:"payment_method"`
}

type DashboardSummary struct {
	TotalPelanggan     int             `json:"total_pelanggan"`
	TotalActive        int             `json:"total_active"`
	TotalLimit         int             `json:"total_limit"`
	TotalInactive      int             `json:"total_inactive"`
	TotalTagihan       int             `json:"total_tagihan_belum_bayar"`
	TotalJatuhTempo    int             `json:"total_jatuh_tempo"`
	TotalMenunggak     int             `json:"total_menunggak"`
	PendapatanBulanIni int             `json:"pendapatan_bulan_ini"`
	PembayaranTerbaru  []RecentPayment `json:"pembayaran_terbaru"`
}

type DashboardSummaryService struct {
	DB *sql.DB
}

func (s *DashboardSummaryService) Get(ctx context.Context) (DashboardSummary, error) {
	summary := DashboardSummary{
		PembayaranTerbaru: []RecentPayment{},
	}

	var menunggakDays int = 30
	var menunggakVal string
	err := s.DB.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'billing_menunggak_days'").Scan(&menunggakVal)
	if err == nil && menunggakVal != "" {
		_, _ = fmt.Sscanf(menunggakVal, "%d", &menunggakDays)
	}

	type queryJob struct {
		sql  string
		dest *int
		args []any
	}

	jobs := []queryJob{
		{sql: `SELECT COUNT(1) FROM pelanggan`, dest: &summary.TotalPelanggan},
		{sql: `SELECT COUNT(1) FROM pelanggan WHERE status = 'active'`, dest: &summary.TotalActive},
		{sql: `SELECT COUNT(1) FROM pelanggan WHERE status = 'limit'`, dest: &summary.TotalLimit},
		{sql: `SELECT COUNT(1) FROM pelanggan WHERE status = 'inactive'`, dest: &summary.TotalInactive},
		{sql: `SELECT COUNT(1) FROM tagihan WHERE status = 'belum_bayar'`, dest: &summary.TotalTagihan},
		{sql: `SELECT COUNT(1) FROM tagihan WHERE status = 'belum_bayar' AND CAST(julianday(date('now')) - julianday(jatuh_tempo) AS INTEGER) > 0 AND CAST(julianday(date('now')) - julianday(jatuh_tempo) AS INTEGER) < ?`, dest: &summary.TotalJatuhTempo, args: []any{menunggakDays}},
		{sql: `SELECT COUNT(1) FROM tagihan WHERE status = 'belum_bayar' AND CAST(julianday(date('now')) - julianday(jatuh_tempo) AS INTEGER) >= ?`, dest: &summary.TotalMenunggak, args: []any{menunggakDays}},
		{sql: `SELECT COALESCE(SUM(nominal), 0) FROM tagihan WHERE status = 'lunas' AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')`, dest: &summary.PendapatanBulanIni},
	}

	for _, job := range jobs {
		if err := s.DB.QueryRowContext(ctx, job.sql, job.args...).Scan(job.dest); err != nil {
			return DashboardSummary{}, fmt.Errorf("query dashboard summary (%s): %w", job.sql, err)
		}
	}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT ph.id, t.invoice_number, c.nama, ph.amount, ph.paid_at, ph.method
		FROM payment_history ph
		INNER JOIN tagihan t ON t.id = ph.tagihan_id
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		ORDER BY ph.id DESC
		LIMIT 5
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p RecentPayment
			if scanErr := rows.Scan(&p.ID, &p.InvoiceNumber, &p.CustomerName, &p.Amount, &p.PaidAt, &p.PaymentMethod); scanErr == nil {
				summary.PembayaranTerbaru = append(summary.PembayaranTerbaru, p)
			}
		}
	}

	return summary, nil
}
