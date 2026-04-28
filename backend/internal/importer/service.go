package importer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
)

type Service struct {
	Logger   *slog.Logger
	SourceDB *sql.DB
	TargetDB *sql.DB
}

type Options struct {
	DryRun bool
}

type Report struct {
	Tables []TableResult `json:"tables"`
}

type TableResult struct {
	Name     string `json:"name"`
	Read     int    `json:"read"`
	Upserted int    `json:"upserted"`
	Skipped  int    `json:"skipped"`
	Errors   int    `json:"errors"`
}

func (s Service) ImportLegacy(ctx context.Context, opts Options) (Report, error) {
	results := []TableResult{
		{Name: "paket"},
		{Name: "pelanggan"},
		{Name: "template_wa"},
		{Name: "pengaturan"},
		{Name: "tagihan"},
	}

	tx, err := s.TargetDB.BeginTx(ctx, nil)
	if err != nil {
		return Report{}, fmt.Errorf("begin import tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := s.importPackages(ctx, tx, &results[0]); err != nil {
		return Report{}, err
	}
	if err := s.importCustomers(ctx, tx, &results[1]); err != nil {
		return Report{}, err
	}
	if err := s.importTemplates(ctx, tx, &results[2]); err != nil {
		return Report{}, err
	}
	if err := s.importSettings(ctx, tx, &results[3]); err != nil {
		return Report{}, err
	}
	if err := s.importBills(ctx, tx, &results[4]); err != nil {
		return Report{}, err
	}

	if opts.DryRun {
		return Report{Tables: results}, nil
	}

	if err := tx.Commit(); err != nil {
		return Report{}, fmt.Errorf("commit import tx: %w", err)
	}
	return Report{Tables: results}, nil
}

func (s Service) importPackages(ctx context.Context, tx *sql.Tx, res *TableResult) error {
	rows, err := queryFirstAvailable(ctx, s.SourceDB, []string{
		`SELECT id, nama, kecepatan AS kecepatan_mbps, harga, COALESCE(deskripsi, '') AS deskripsi FROM paket`,
		`SELECT id, nama, kecepatan_mbps, harga, COALESCE(deskripsi, '') AS deskripsi FROM paket`,
	})
	if err != nil {
		return fmt.Errorf("query legacy paket: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id        int64
			nama      string
			kecepatan int
			harga     int
			deskripsi string
		)
		res.Read++
		if err := rows.Scan(&id, &nama, &kecepatan, &harga, &deskripsi); err != nil {
			res.Errors++
			continue
		}
		if strings.TrimSpace(nama) == "" {
			res.Skipped++
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO paket(id, nama, kecepatan_mbps, harga, deskripsi, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO UPDATE SET
				nama = excluded.nama,
				kecepatan_mbps = excluded.kecepatan_mbps,
				harga = excluded.harga,
				deskripsi = excluded.deskripsi,
				updated_at = CURRENT_TIMESTAMP
		`, id, nama, kecepatan, harga, deskripsi)
		if err != nil {
			res.Errors++
			continue
		}
		res.Upserted++
	}
	return rows.Err()
}

func (s Service) importCustomers(ctx context.Context, tx *sql.Tx, res *TableResult) error {
	rows, err := queryFirstAvailable(ctx, s.SourceDB, []string{
		`SELECT
			id, nama, paket_id, COALESCE(user_pppoe, ''), COALESCE(password_pppoe, ''),
			COALESCE(nomor_wa, ''), COALESCE(sn_ont, ''), tgl_jatuh_tempo,
			COALESCE(status, 'active'), COALESCE(alamat, '')
		FROM pelanggan`,
		`SELECT
			id, nama, paket_id, COALESCE(user_pppoe, ''), COALESCE(password_pppoe, ''),
			COALESCE(no_wa, ''), COALESCE(sn_ont, ''), tgl_jatuh_tempo,
			COALESCE(status, 'active'), COALESCE(alamat, '')
		FROM pelanggan`,
	})
	if err != nil {
		return fmt.Errorf("query legacy pelanggan: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id, paketID int64
			nama        string
			userPPPoE   string
			passPPPoE   string
			nomorWA     string
			snOnt       string
			dueDay      int
			status      string
			alamat      string
		)
		res.Read++
		if err := rows.Scan(&id, &nama, &paketID, &userPPPoE, &passPPPoE, &nomorWA, &snOnt, &dueDay, &status, &alamat); err != nil {
			res.Errors++
			continue
		}
		if strings.TrimSpace(nama) == "" || dueDay <= 0 {
			res.Skipped++
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO pelanggan(
				id, nama, paket_id, user_pppoe, password_pppoe, nomor_wa, sn_ont,
				tgl_jatuh_tempo, status, alamat, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO UPDATE SET
				nama = excluded.nama,
				paket_id = excluded.paket_id,
				user_pppoe = excluded.user_pppoe,
				password_pppoe = excluded.password_pppoe,
				nomor_wa = excluded.nomor_wa,
				sn_ont = excluded.sn_ont,
				tgl_jatuh_tempo = excluded.tgl_jatuh_tempo,
				status = excluded.status,
				alamat = excluded.alamat,
				updated_at = CURRENT_TIMESTAMP
		`, id, nama, paketID, userPPPoE, passPPPoE, nomorWA, snOnt, dueDay, status, alamat)
		if err != nil {
			res.Errors++
			continue
		}
		res.Upserted++
	}
	return rows.Err()
}

func (s Service) importTemplates(ctx context.Context, tx *sql.Tx, res *TableResult) error {
	rows, err := queryFirstAvailable(ctx, s.SourceDB, []string{
		`SELECT id, nama, trigger_key, isi_template, COALESCE(is_active, 1) FROM template_wa`,
		`SELECT id, nama, trigger, template, COALESCE(is_active, 1) FROM template_wa`,
	})
	if err != nil {
		return fmt.Errorf("query legacy template_wa: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id       int64
			nama     string
			trigger  string
			content  string
			isActive int
		)
		res.Read++
		if err := rows.Scan(&id, &nama, &trigger, &content, &isActive); err != nil {
			res.Errors++
			continue
		}
		if strings.TrimSpace(trigger) == "" || strings.TrimSpace(content) == "" {
			res.Skipped++
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO template_wa(id, nama, trigger_key, isi_template, is_active, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO UPDATE SET
				nama = excluded.nama,
				trigger_key = excluded.trigger_key,
				isi_template = excluded.isi_template,
				is_active = excluded.is_active,
				updated_at = CURRENT_TIMESTAMP
		`, id, nama, trigger, content, isActive)
		if err != nil {
			res.Errors++
			continue
		}
		res.Upserted++
	}
	return rows.Err()
}

func (s Service) importSettings(ctx context.Context, tx *sql.Tx, res *TableResult) error {
	rows, err := queryFirstAvailable(ctx, s.SourceDB, []string{
		`SELECT key, value FROM pengaturan`,
		`SELECT nama AS key, nilai AS value FROM pengaturan`,
	})
	if err != nil {
		return fmt.Errorf("query legacy pengaturan: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		res.Read++
		if err := rows.Scan(&key, &value); err != nil {
			res.Errors++
			continue
		}
		if strings.TrimSpace(key) == "" {
			res.Skipped++
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO pengaturan(key, value, updated_at)
			VALUES (?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				updated_at = CURRENT_TIMESTAMP
		`, key, value)
		if err != nil {
			res.Errors++
			continue
		}
		res.Upserted++
	}
	return rows.Err()
}

func (s Service) importBills(ctx context.Context, tx *sql.Tx, res *TableResult) error {
	rows, err := queryFirstAvailable(ctx, s.SourceDB, []string{
		`SELECT
			id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo,
			status, paid_at, COALESCE(payment_method, ''), COALESCE(proof_path, '')
		FROM tagihan`,
		`SELECT
			id, pelanggan_id, paket_id, periode, no_invoice AS invoice_number, nominal, jatuh_tempo,
			status, paid_at, COALESCE(payment_method, ''), COALESCE(bukti_bayar, '')
		FROM tagihan`,
	})
	if err != nil {
		return fmt.Errorf("query legacy tagihan: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id, pelangganID, paketID int64
			periode                  string
			invoice                  string
			nominal                  int
			jatuhTempo               string
			status                   string
			paidAt                   sql.NullString
			paymentMethod            string
			proofPath                string
		)
		res.Read++
		if err := rows.Scan(&id, &pelangganID, &paketID, &periode, &invoice, &nominal, &jatuhTempo, &status, &paidAt, &paymentMethod, &proofPath); err != nil {
			res.Errors++
			continue
		}
		if strings.TrimSpace(periode) == "" || strings.TrimSpace(invoice) == "" || strings.TrimSpace(jatuhTempo) == "" {
			res.Skipped++
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO tagihan(
				id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status,
				paid_at, payment_method, proof_path, created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO UPDATE SET
				pelanggan_id = excluded.pelanggan_id,
				paket_id = excluded.paket_id,
				periode = excluded.periode,
				invoice_number = excluded.invoice_number,
				nominal = excluded.nominal,
				jatuh_tempo = excluded.jatuh_tempo,
				status = excluded.status,
				paid_at = excluded.paid_at,
				payment_method = excluded.payment_method,
				proof_path = excluded.proof_path,
				updated_at = CURRENT_TIMESTAMP
		`, id, pelangganID, paketID, periode, invoice, nominal, jatuhTempo, status, nullToValue(paidAt), paymentMethod, proofPath)
		if err != nil {
			res.Errors++
			continue
		}
		res.Upserted++
	}
	return rows.Err()
}

func queryFirstAvailable(ctx context.Context, db *sql.DB, queries []string) (*sql.Rows, error) {
	var lastErr error
	for _, q := range queries {
		rows, err := db.QueryContext(ctx, q)
		if err == nil {
			return rows, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("no query candidates provided")
	}
	return nil, lastErr
}

func nullToValue(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
