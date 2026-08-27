package reports

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
)

type RevenueItem struct {
	Period      string  `json:"period"`
	TotalBilled float64 `json:"total_billed"`
	TotalPaid   float64 `json:"total_paid"`
}

type AgingReport struct {
	Current   float64 `json:"current"`    // Belum jatuh tempo
	Days1_30  float64 `json:"days_1_30"`  // 1-30 hari lewat jatuh tempo
	Days31_60 float64 `json:"days_31_60"` // 31-60 hari lewat jatuh tempo
	Over60    float64 `json:"over_60"`    // > 60 hari lewat jatuh tempo
}

type Service struct {
	DB *sql.DB
}

func (s Service) MonthlyRevenue(ctx context.Context, limit int) ([]RevenueItem, error) {
	if limit <= 0 || limit > 24 {
		limit = 12
	}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT periode, 
		       COALESCE(SUM(nominal), 0) as total_billed,
		       COALESCE(SUM(CASE WHEN status = 'lunas' THEN nominal ELSE 0 END), 0) as total_paid
		FROM tagihan
		GROUP BY periode
		ORDER BY periode DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("query monthly revenue: %w", err)
	}
	defer rows.Close()

	items := []RevenueItem{}
	for rows.Next() {
		var item RevenueItem
		if err := rows.Scan(&item.Period, &item.TotalBilled, &item.TotalPaid); err != nil {
			return nil, fmt.Errorf("scan revenue item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s Service) Aging(ctx context.Context) (AgingReport, error) {
	var report AgingReport
	row := s.DB.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN jatuh_tempo >= DATE('now') THEN nominal ELSE 0 END), 0) as current,
			COALESCE(SUM(CASE WHEN jatuh_tempo < DATE('now') AND jatuh_tempo >= DATE('now', '-30 days') THEN nominal ELSE 0 END), 0) as days_1_30,
			COALESCE(SUM(CASE WHEN jatuh_tempo < DATE('now', '-30 days') AND jatuh_tempo >= DATE('now', '-60 days') THEN nominal ELSE 0 END), 0) as days_31_60,
			COALESCE(SUM(CASE WHEN jatuh_tempo < DATE('now', '-60 days') THEN nominal ELSE 0 END), 0) as over_60
		FROM tagihan
		WHERE status = 'belum_bayar'
	`)
	if err := row.Scan(&report.Current, &report.Days1_30, &report.Days31_60, &report.Over60); err != nil {
		return AgingReport{}, fmt.Errorf("query aging report: %w", err)
	}
	return report, nil
}

func (s Service) ExportBillsCSV(ctx context.Context, w io.Writer) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := []string{"Invoice", "Nama Pelanggan", "Paket", "Periode", "Nominal", "Status", "Tanggal Bayar", "Tanggal Jatuh Tempo"}
	if err := writer.Write(header); err != nil {
		return fmt.Errorf("write bills csv header: %w", err)
	}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT t.invoice_number, c.nama, p.nama, t.periode, t.nominal, t.status, COALESCE(t.paid_at, ''), t.jatuh_tempo
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		ORDER BY t.id DESC
	`)
	if err != nil {
		return fmt.Errorf("query bills for csv: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var invoice, customerName, packageName, period, status, paidAt, dueDate string
		var nominal int
		if err := rows.Scan(&invoice, &customerName, &packageName, &period, &nominal, &status, &paidAt, &dueDate); err != nil {
			return fmt.Errorf("scan bill for csv: %w", err)
		}
		record := []string{
			invoice,
			customerName,
			packageName,
			period,
			strconv.Itoa(nominal),
			status,
			paidAt,
			dueDate,
		}
		if err := writer.Write(record); err != nil {
			return fmt.Errorf("write bill record to csv: %w", err)
		}
	}

	return rows.Err()
}

func (s Service) ExportCustomersCSV(ctx context.Context, w io.Writer) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := []string{"Nama", "Paket", "PPPoE User", "WhatsApp", "SN ONT", "Jatuh Tempo", "Status", "Alamat", "Referral Balance", "Diskon", "Tipe Diskon"}
	if err := writer.Write(header); err != nil {
		return fmt.Errorf("write customers csv header: %w", err)
	}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT c.nama, p.nama, COALESCE(c.user_pppoe, ''), COALESCE(c.nomor_wa, ''), COALESCE(c.sn_ont, ''),
		       c.tgl_jatuh_tempo, c.status, COALESCE(c.alamat, ''), c.referral_balance, c.diskon, COALESCE(c.tipe_diskon, 'flat')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		ORDER BY c.id DESC
	`)
	if err != nil {
		return fmt.Errorf("query customers for csv: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name, packageName, pppoeUser, whatsapp, snOnt, status, address, tipeDiskon string
		var dueDay, referralBalance, diskon int
		if err := rows.Scan(&name, &packageName, &pppoeUser, &whatsapp, &snOnt, &dueDay, &status, &address, &referralBalance, &diskon, &tipeDiskon); err != nil {
			return fmt.Errorf("scan customer for csv: %w", err)
		}
		record := []string{
			name,
			packageName,
			pppoeUser,
			whatsapp,
			snOnt,
			strconv.Itoa(dueDay),
			status,
			address,
			strconv.Itoa(referralBalance),
			strconv.Itoa(diskon),
			tipeDiskon,
		}
		if err := writer.Write(record); err != nil {
			return fmt.Errorf("write customer record to csv: %w", err)
		}
	}

	return rows.Err()
}
