package packages

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrPackageNotFound = errors.New("package not found")
var ErrPackageInUse = errors.New("package is still assigned to customers")

type Package struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	SpeedMbps     int    `json:"speed_mbps"`
	Price         int    `json:"price"`
	Description   string `json:"description"`
	CustomerCount int    `json:"customer_count"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Package, error) {
	return s.Repository.List(ctx)
}

func (s Service) Create(ctx context.Context, pkg Package) (Package, error) {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return Package{}, errors.New("package name is required")
	}

	if pkg.SpeedMbps <= 0 {
		return Package{}, errors.New("package speed must be greater than 0")
	}

	if pkg.Price < 0 {
		return Package{}, errors.New("package price must not be negative")
	}

	return s.Repository.Create(ctx, pkg)
}

func (s Service) Update(ctx context.Context, id int64, pkg Package) (Package, error) {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return Package{}, errors.New("package name is required")
	}

	if pkg.SpeedMbps <= 0 {
		return Package{}, errors.New("package speed must be greater than 0")
	}

	if pkg.Price < 0 {
		return Package{}, errors.New("package price must not be negative")
	}

	return s.Repository.Update(ctx, id, pkg)
}

func (s Service) Delete(ctx context.Context, id int64) error {
	return s.Repository.Delete(ctx, id)
}

func (r Repository) List(ctx context.Context) ([]Package, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT p.id, p.nama, p.kecepatan_mbps, p.harga, COALESCE(p.deskripsi, ''), COUNT(c.id)
		FROM paket p
		LEFT JOIN pelanggan c ON c.paket_id = p.id
		GROUP BY p.id, p.nama, p.kecepatan_mbps, p.harga, p.deskripsi
		ORDER BY p.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list packages: %w", err)
	}
	defer rows.Close()

	items := []Package{}
	for rows.Next() {
		var item Package
		if err := rows.Scan(&item.ID, &item.Name, &item.SpeedMbps, &item.Price, &item.Description, &item.CustomerCount); err != nil {
			return nil, fmt.Errorf("scan package: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, pkg Package) (Package, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO paket (nama, kecepatan_mbps, harga, deskripsi, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, pkg.Name, pkg.SpeedMbps, pkg.Price, strings.TrimSpace(pkg.Description))
	if err != nil {
		return Package{}, fmt.Errorf("create package: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Package{}, fmt.Errorf("get package id: %w", err)
	}

	pkg.ID = id
	return pkg, nil
}

func (r Repository) Update(ctx context.Context, id int64, pkg Package) (Package, error) {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE paket
		SET nama = ?, kecepatan_mbps = ?, harga = ?, deskripsi = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, pkg.Name, pkg.SpeedMbps, pkg.Price, strings.TrimSpace(pkg.Description), id)
	if err != nil {
		return Package{}, fmt.Errorf("update package: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Package{}, fmt.Errorf("package update rows affected: %w", err)
	}

	if affected == 0 {
		return Package{}, ErrPackageNotFound
	}

	pkg.ID = id
	return pkg, nil
}

func (r Repository) Delete(ctx context.Context, id int64) error {
	var customerCount int
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM pelanggan WHERE paket_id = ?`, id).Scan(&customerCount); err != nil {
		return fmt.Errorf("count package customers: %w", err)
	}

	if customerCount > 0 {
		return ErrPackageInUse
	}

	result, err := r.DB.ExecContext(ctx, `DELETE FROM paket WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete package: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("package delete rows affected: %w", err)
	}

	if affected == 0 {
		return ErrPackageNotFound
	}

	return nil
}
