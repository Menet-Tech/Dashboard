package reports

import (
	"context"
	"database/sql"
	"fmt"
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
		SELECT period, 
		       COALESCE(SUM(amount), 0) as total_billed,
		       COALESCE(SUM(CASE WHEN status = 'lunas' THEN amount ELSE 0 END), 0) as total_paid
		FROM bills
		GROUP BY period
		ORDER BY period DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("query monthly revenue: %w", err)
	}
	defer rows.Close()

	var items []RevenueItem
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
			COALESCE(SUM(CASE WHEN due_date >= DATE('now') THEN amount ELSE 0 END), 0) as current,
			COALESCE(SUM(CASE WHEN due_date < DATE('now') AND due_date >= DATE('now', '-30 days') THEN amount ELSE 0 END), 0) as days_1_30,
			COALESCE(SUM(CASE WHEN due_date < DATE('now', '-30 days') AND due_date >= DATE('now', '-60 days') THEN amount ELSE 0 END), 0) as days_31_60,
			COALESCE(SUM(CASE WHEN due_date < DATE('now', '-60 days') THEN amount ELSE 0 END), 0) as over_60
		FROM bills
		WHERE status = 'belum_bayar'
	`)
	if err := row.Scan(&report.Current, &report.Days1_30, &report.Days31_60, &report.Over60); err != nil {
		return AgingReport{}, fmt.Errorf("query aging report: %w", err)
	}
	return report, nil
}
