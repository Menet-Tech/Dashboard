package odp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrOdpNotFound = errors.New("odp not found")
var ErrOdpInUse = errors.New("odp is still in use by customers")

type Odp struct {
	ID            int64  `json:"id"`
	Nama          string `json:"nama"`
	Lokasi        string `json:"lokasi"`
	Deskripsi     string `json:"deskripsi"`
	CustomerCount int    `json:"customer_count"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Odp, error) {
	return s.Repository.List(ctx)
}

func (s Service) FindByID(ctx context.Context, id int64) (Odp, error) {
	return s.Repository.FindByID(ctx, id)
}

func (s Service) Create(ctx context.Context, o Odp) (Odp, error) {
	o.Nama = strings.TrimSpace(o.Nama)
	o.Lokasi = strings.TrimSpace(o.Lokasi)
	if o.Nama == "" {
		return Odp{}, errors.New("odp name is required")
	}
	if o.Lokasi == "" {
		return Odp{}, errors.New("odp location is required")
	}
	return s.Repository.Create(ctx, o)
}

func (s Service) Update(ctx context.Context, id int64, o Odp) (Odp, error) {
	o.Nama = strings.TrimSpace(o.Nama)
	o.Lokasi = strings.TrimSpace(o.Lokasi)
	if o.Nama == "" {
		return Odp{}, errors.New("odp name is required")
	}
	if o.Lokasi == "" {
		return Odp{}, errors.New("odp location is required")
	}
	return s.Repository.Update(ctx, id, o)
}

func (s Service) Delete(ctx context.Context, id int64) error {
	return s.Repository.Delete(ctx, id)
}

func (r Repository) List(ctx context.Context) ([]Odp, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT o.id, o.nama, o.lokasi, COALESCE(o.deskripsi, ''), COUNT(c.id)
		FROM odp o
		LEFT JOIN pelanggan c ON c.odp_id = o.id
		GROUP BY o.id, o.nama, o.lokasi, o.deskripsi
		ORDER BY o.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list odps: %w", err)
	}
	defer rows.Close()

	items := []Odp{}
	for rows.Next() {
		var item Odp
		if err := rows.Scan(&item.ID, &item.Nama, &item.Lokasi, &item.Deskripsi, &item.CustomerCount); err != nil {
			return nil, fmt.Errorf("scan odp: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) FindByID(ctx context.Context, id int64) (Odp, error) {
	var item Odp
	err := r.DB.QueryRowContext(ctx, `
		SELECT o.id, o.nama, o.lokasi, COALESCE(o.deskripsi, ''), COUNT(c.id)
		FROM odp o
		LEFT JOIN pelanggan c ON c.odp_id = o.id
		WHERE o.id = ?
		GROUP BY o.id, o.nama, o.lokasi, o.deskripsi
	`, id).Scan(&item.ID, &item.Nama, &item.Lokasi, &item.Deskripsi, &item.CustomerCount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Odp{}, ErrOdpNotFound
		}
		return Odp{}, fmt.Errorf("find odp by id: %w", err)
	}
	return item, nil
}

func (r Repository) Create(ctx context.Context, o Odp) (Odp, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO odp (nama, lokasi, deskripsi, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
	`, o.Nama, o.Lokasi, strings.TrimSpace(o.Deskripsi))
	if err != nil {
		return Odp{}, fmt.Errorf("create odp: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Odp{}, fmt.Errorf("get odp id: %w", err)
	}

	o.ID = id
	return o, nil
}

func (r Repository) Update(ctx context.Context, id int64, o Odp) (Odp, error) {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE odp
		SET nama = ?, lokasi = ?, deskripsi = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, o.Nama, o.Lokasi, strings.TrimSpace(o.Deskripsi), id)
	if err != nil {
		return Odp{}, fmt.Errorf("update odp: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Odp{}, fmt.Errorf("odp update rows affected: %w", err)
	}
	if affected == 0 {
		return Odp{}, ErrOdpNotFound
	}

	o.ID = id
	return o, nil
}

func (r Repository) Delete(ctx context.Context, id int64) error {
	var customerCount int
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM pelanggan WHERE odp_id = ?`, id).Scan(&customerCount); err != nil {
		return fmt.Errorf("count odp customers: %w", err)
	}
	if customerCount > 0 {
		return ErrOdpInUse
	}

	result, err := r.DB.ExecContext(ctx, `DELETE FROM odp WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete odp: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("odp delete rows affected: %w", err)
	}
	if affected == 0 {
		return ErrOdpNotFound
	}
	return nil
}
