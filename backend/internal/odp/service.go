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
	Ports         int    `json:"ports"`
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
	if o.Ports <= 0 {
		o.Ports = 8
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
	if o.Ports <= 0 {
		o.Ports = 8
	}
	return s.Repository.Update(ctx, id, o)
}

func (s Service) Delete(ctx context.Context, id int64) error {
	return s.Repository.Delete(ctx, id)
}

func (r Repository) List(ctx context.Context) ([]Odp, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT o.id, o.nama, o.lokasi, COALESCE(o.deskripsi, ''), o.ports, COUNT(c.id)
		FROM odp o
		LEFT JOIN pelanggan c ON c.odp_id = o.id
		GROUP BY o.id, o.nama, o.lokasi, o.deskripsi, o.ports
		ORDER BY o.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list odps: %w", err)
	}
	defer rows.Close()

	items := []Odp{}
	for rows.Next() {
		var item Odp
		if err := rows.Scan(&item.ID, &item.Nama, &item.Lokasi, &item.Deskripsi, &item.Ports, &item.CustomerCount); err != nil {
			return nil, fmt.Errorf("scan odp: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) FindByID(ctx context.Context, id int64) (Odp, error) {
	var item Odp
	err := r.DB.QueryRowContext(ctx, `
		SELECT o.id, o.nama, o.lokasi, COALESCE(o.deskripsi, ''), o.ports, COUNT(c.id)
		FROM odp o
		LEFT JOIN pelanggan c ON c.odp_id = o.id
		WHERE o.id = ?
		GROUP BY o.id, o.nama, o.lokasi, o.deskripsi, o.ports
	`, id).Scan(&item.ID, &item.Nama, &item.Lokasi, &item.Deskripsi, &item.Ports, &item.CustomerCount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Odp{}, ErrOdpNotFound
		}
		return Odp{}, fmt.Errorf("find odp by id: %w", err)
	}
	return item, nil
}

func parseCoordinates(lokasi string) (float64, float64) {
	lat := -6.2088
	lng := 106.8456

	parts := strings.Split(lokasi, ",")
	if len(parts) == 2 {
		var pLat, pLng float64
		_, err1 := fmt.Sscanf(strings.TrimSpace(parts[0]), "%f", &pLat)
		_, err2 := fmt.Sscanf(strings.TrimSpace(parts[1]), "%f", &pLng)
		if err1 == nil && err2 == nil && pLat >= -90 && pLat <= 90 && pLng >= -180 && pLng <= 180 {
			lat = pLat
			lng = pLng
		}
	}
	return lat, lng
}

func (r Repository) Create(ctx context.Context, o Odp) (Odp, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return Odp{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO odp (nama, lokasi, deskripsi, ports, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, o.Nama, o.Lokasi, strings.TrimSpace(o.Deskripsi), o.Ports)
	if err != nil {
		return Odp{}, fmt.Errorf("create odp in table: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Odp{}, fmt.Errorf("get odp id: %w", err)
	}
	o.ID = id

	lat, lng := parseCoordinates(o.Lokasi)
	nodeID := fmt.Sprintf("odp-%d", id)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO mapping_nodes (node_id, type, name, latitude, longitude, capacity, notes, created_at, updated_at)
		VALUES (?, 'odp', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(node_id) DO UPDATE SET
			name = ?,
			latitude = ?,
			longitude = ?,
			capacity = ?,
			notes = ?,
			updated_at = CURRENT_TIMESTAMP`,
		nodeID, o.Nama, lat, lng, o.Ports, strings.TrimSpace(o.Deskripsi),
		o.Nama, lat, lng, o.Ports, strings.TrimSpace(o.Deskripsi),
	)
	if err != nil {
		return Odp{}, fmt.Errorf("create mapping node for odp: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return Odp{}, fmt.Errorf("commit create odp: %w", err)
	}

	return o, nil
}

func (r Repository) Update(ctx context.Context, id int64, o Odp) (Odp, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return Odp{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		UPDATE odp
		SET nama = ?, lokasi = ?, deskripsi = ?, ports = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, o.Nama, o.Lokasi, strings.TrimSpace(o.Deskripsi), o.Ports, id)
	if err != nil {
		return Odp{}, fmt.Errorf("update odp table: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Odp{}, fmt.Errorf("odp update rows affected: %w", err)
	}
	if affected == 0 {
		return Odp{}, ErrOdpNotFound
	}

	lat, lng := parseCoordinates(o.Lokasi)
	nodeID := fmt.Sprintf("odp-%d", id)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO mapping_nodes (node_id, type, name, latitude, longitude, capacity, notes, created_at, updated_at)
		VALUES (?, 'odp', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(node_id) DO UPDATE SET
			name = ?,
			latitude = ?,
			longitude = ?,
			capacity = ?,
			notes = ?,
			updated_at = CURRENT_TIMESTAMP`,
		nodeID, o.Nama, lat, lng, o.Ports, strings.TrimSpace(o.Deskripsi),
		o.Nama, lat, lng, o.Ports, strings.TrimSpace(o.Deskripsi),
	)
	if err != nil {
		return Odp{}, fmt.Errorf("update mapping node for odp: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return Odp{}, fmt.Errorf("commit update odp: %w", err)
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

	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `DELETE FROM odp WHERE id = ?`, id)
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

	nodeID := fmt.Sprintf("odp-%d", id)
	_, err = tx.ExecContext(ctx, "DELETE FROM mapping_nodes WHERE node_id = ?", nodeID)
	if err != nil {
		return fmt.Errorf("delete mapping node for odp: %w", err)
	}

	return tx.Commit()
}
