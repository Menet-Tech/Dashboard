package service

import (
	"context"
	"database/sql"
	"fmt"
)

type DashboardSummary struct {
	TotalPelanggan int `json:"total_pelanggan"`
	TotalActive    int `json:"total_active"`
	TotalLimit     int `json:"total_limit"`
	TotalInactive  int `json:"total_inactive"`
	TotalTagihan   int `json:"total_tagihan_belum_bayar"`
}

type DashboardSummaryService struct {
	DB *sql.DB
}

func (s *DashboardSummaryService) Get(ctx context.Context) (DashboardSummary, error) {
	summary := DashboardSummary{}

	queries := map[string]*int{
		`SELECT COUNT(1) FROM pelanggan`:                            &summary.TotalPelanggan,
		`SELECT COUNT(1) FROM pelanggan WHERE status = 'active'`:    &summary.TotalActive,
		`SELECT COUNT(1) FROM pelanggan WHERE status = 'limit'`:     &summary.TotalLimit,
		`SELECT COUNT(1) FROM pelanggan WHERE status = 'inactive'`:  &summary.TotalInactive,
		`SELECT COUNT(1) FROM tagihan WHERE status = 'belum_bayar'`: &summary.TotalTagihan,
	}

	for query, destination := range queries {
		if err := s.DB.QueryRowContext(ctx, query).Scan(destination); err != nil {
			return DashboardSummary{}, fmt.Errorf("query dashboard summary: %w", err)
		}
	}

	return summary, nil
}
