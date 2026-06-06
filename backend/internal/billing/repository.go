package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Repository struct {
	DB *sql.DB
}

func (r Repository) List(ctx context.Context, menunggakDays int, now time.Time) ([]Bill, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path, t.diskon, t.diskon_referral
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		ORDER BY t.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list bills: %w", err)
	}
	defer rows.Close()

	items := []Bill{}
	for rows.Next() {
		item, err := scanBill(rows, menunggakDays, now)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) FindByID(ctx context.Context, billID int64, menunggakDays int, now time.Time) (BillDetail, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path, COALESCE(c.alamat, ''), c.status, t.diskon, t.diskon_referral
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		WHERE t.id = ?
		LIMIT 1
	`, billID)

	var item BillDetail
	var paidAt sql.NullString
	var proofPath sql.NullString
	if err := row.Scan(
		&item.ID,
		&item.CustomerID,
		&item.CustomerName,
		&item.CustomerPhone,
		&item.PackageID,
		&item.PackageName,
		&item.PackageSpeed,
		&item.Period,
		&item.InvoiceNumber,
		&item.Amount,
		&item.DueDate,
		&item.Status,
		&paidAt,
		&item.PaymentMethod,
		&proofPath,
		&item.CustomerAddress,
		&item.CustomerStatus,
		&item.Diskon,
		&item.DiskonReferral,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return BillDetail{}, ErrBillNotFound
		}
		return BillDetail{}, fmt.Errorf("find bill by id: %w", err)
	}

	if paidAt.Valid {
		item.PaidAt = &paidAt.String
	}
	if proofPath.Valid {
		item.ProofPath = &proofPath.String
	}
	item.DisplayStatus = computeDisplayStatus(item.Status, item.DueDate, menunggakDays, now)

	paymentHistory, err := r.paymentHistory(ctx, billID)
	if err != nil {
		return BillDetail{}, err
	}
	item.PaymentHistory = paymentHistory

	return item, nil
}

func (r Repository) Generate(ctx context.Context, period string) (int, error) {
	candidates, err := r.findCandidates(ctx, period)
	if err != nil {
		return 0, err
	}

	if len(candidates) == 0 {
		return 0, nil
	}

	periodTime, err := time.Parse("2006-01", period)
	if err != nil {
		return 0, fmt.Errorf("parse period: %w", err)
	}

	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin bill generation tx: %w", err)
	}

	generated := 0
	for _, candidate := range candidates {
		dueDate := resolveDueDate(periodTime, candidate.DueDay)
		serial, err := billSerial(ctx, tx, candidate.CustomerID)
		if err != nil {
			_ = tx.Rollback()
			return 0, err
		}

		invoiceNumber := fmt.Sprintf(
			"%s/%d/%d/%03d",
			dueDate.Format("02-01-2006"),
			candidate.CustomerID,
			candidate.PackageSpeed,
			serial,
		)

		diskon := candidate.Diskon
		if diskon < 0 {
			diskon = 0
		}
		afterDiskon := candidate.PackagePrice - diskon
		if afterDiskon < 0 {
			afterDiskon = 0
		}

		diskonReferral := candidate.ReferralBalance
		if diskonReferral > afterDiskon {
			diskonReferral = afterDiskon
		}
		if diskonReferral < 0 {
			diskonReferral = 0
		}

		finalAmount := afterDiskon - diskonReferral

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO tagihan (
				pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, diskon, diskon_referral, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar', ?, ?, CURRENT_TIMESTAMP)
		`, candidate.CustomerID, candidate.PackageID, period, invoiceNumber, finalAmount, dueDate.Format("2006-01-02"), diskon, diskonReferral); err != nil {
			_ = tx.Rollback()
			return 0, fmt.Errorf("insert generated bill: %w", err)
		}

		if diskonReferral > 0 {
			_, err = tx.ExecContext(ctx, `
				UPDATE pelanggan
				SET referral_balance = referral_balance - ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, diskonReferral, candidate.CustomerID)
			if err != nil {
				_ = tx.Rollback()
				return 0, fmt.Errorf("deduct referral balance: %w", err)
			}
		}

		generated++
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit generated bills: %w", err)
	}

	return generated, nil
}

func (r Repository) EnsureBillForCustomer(ctx context.Context, customerID int64, period string, menunggakDays int, now time.Time) (Bill, bool, error) {
	if existing, err := r.FindByCustomerAndPeriod(ctx, customerID, period, menunggakDays, now); err == nil {
		return existing, false, nil
	} else if !errors.Is(err, ErrBillNotFound) {
		return Bill{}, false, err
	}

	periodTime, err := time.Parse("2006-01", period)
	if err != nil {
		return Bill{}, false, fmt.Errorf("parse period: %w", err)
	}

	candidate, found, err := r.findCandidateForCustomer(ctx, customerID, period)
	if err != nil {
		return Bill{}, false, err
	}
	if !found {
		return Bill{}, false, nil
	}

	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return Bill{}, false, fmt.Errorf("begin single bill generation tx: %w", err)
	}

	dueDate := resolveDueDate(periodTime, candidate.DueDay)
	serial, err := billSerial(ctx, tx, candidate.CustomerID)
	if err != nil {
		_ = tx.Rollback()
		return Bill{}, false, err
	}

	invoiceNumber := fmt.Sprintf(
		"%s/%d/%d/%03d",
		dueDate.Format("02-01-2006"),
		candidate.CustomerID,
		candidate.PackageSpeed,
		serial,
	)

	diskon := candidate.Diskon
	if diskon < 0 {
		diskon = 0
	}
	afterDiskon := candidate.PackagePrice - diskon
	if afterDiskon < 0 {
		afterDiskon = 0
	}

	diskonReferral := candidate.ReferralBalance
	if diskonReferral > afterDiskon {
		diskonReferral = afterDiskon
	}
	if diskonReferral < 0 {
		diskonReferral = 0
	}

	finalAmount := afterDiskon - diskonReferral

	result, err := tx.ExecContext(ctx, `
		INSERT INTO tagihan (
			pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, diskon, diskon_referral, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar', ?, ?, CURRENT_TIMESTAMP)
	`, candidate.CustomerID, candidate.PackageID, period, invoiceNumber, finalAmount, dueDate.Format("2006-01-02"), diskon, diskonReferral)
	if err != nil {
		_ = tx.Rollback()
		return Bill{}, false, fmt.Errorf("insert single generated bill: %w", err)
	}

	billID, err := result.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return Bill{}, false, fmt.Errorf("single generated bill id: %w", err)
	}

	if diskonReferral > 0 {
		_, err = tx.ExecContext(ctx, `
			UPDATE pelanggan
			SET referral_balance = referral_balance - ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, diskonReferral, candidate.CustomerID)
		if err != nil {
			_ = tx.Rollback()
			return Bill{}, false, fmt.Errorf("deduct referral balance: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return Bill{}, false, fmt.Errorf("commit single generated bill: %w", err)
	}

	return Bill{
		ID:             billID,
		CustomerID:     candidate.CustomerID,
		CustomerName:   candidate.CustomerName,
		CustomerPhone:  candidate.CustomerPhone,
		PackageID:      candidate.PackageID,
		PackageName:    candidate.PackageName,
		PackageSpeed:   candidate.PackageSpeed,
		Period:         period,
		InvoiceNumber:  invoiceNumber,
		Amount:         finalAmount,
		DueDate:        dueDate.Format("2006-01-02"),
		Status:         "belum_bayar",
		DisplayStatus:  computeDisplayStatus("belum_bayar", dueDate.Format("2006-01-02"), menunggakDays, now),
		Diskon:         diskon,
		DiskonReferral: diskonReferral,
	}, true, nil
}

func (r Repository) MarkPaid(ctx context.Context, billID int64, method string, userID int64) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin mark paid tx: %w", err)
	}

	bill, err := findBillForPayment(ctx, tx, billID)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := tx.ExecContext(ctx, `
		UPDATE tagihan
		SET status = 'lunas', paid_at = ?, payment_method = ?, paid_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, now, method, userID, billID)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update bill status paid: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("bill paid rows affected: %w", err)
	}

	if affected == 0 {
		_ = tx.Rollback()
		return ErrBillNotFound
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO payment_history (tagihan_id, method, amount, paid_at, created_by_user_id)
		VALUES (?, ?, ?, ?, ?)
	`, bill.ID, method, bill.Amount, now, userID); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("insert payment history: %w", err)
	}

	unpaidCount, err := unpaidCountForCustomer(ctx, tx, bill.CustomerID)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	nextStatus := "active"
	if unpaidCount > 0 {
		nextStatus = "limit"
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE pelanggan
		SET status = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, nextStatus, bill.CustomerID); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("restore customer status: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit mark paid: %w", err)
	}

	return nil
}

func (r Repository) AttachProof(ctx context.Context, billID int64, proofPath string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin attach proof tx: %w", err)
	}

	result, err := tx.ExecContext(ctx, `
		UPDATE tagihan
		SET proof_path = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, proofPath, billID)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update bill proof path: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("bill proof rows affected: %w", err)
	}
	if affected == 0 {
		_ = tx.Rollback()
		return ErrBillNotFound
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE payment_history
		SET proof_path = ?
		WHERE id = (
			SELECT id
			FROM payment_history
			WHERE tagihan_id = ?
			ORDER BY id DESC
			LIMIT 1
		)
	`, proofPath, billID); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("update payment history proof path: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit attach proof: %w", err)
	}

	return nil
}

func (r Repository) AutomationCandidates(ctx context.Context) ([]automationCandidate, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path, c.status, COALESCE(c.trial_started_at, ''), COALESCE(c.trial_days, 0)
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		WHERE t.status = 'belum_bayar'
		ORDER BY t.id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("automation candidates: %w", err)
	}
	defer rows.Close()

	items := []automationCandidate{}
	for rows.Next() {
		var item automationCandidate
		var paidAt sql.NullString
		var proofPath sql.NullString
		var trialStartedAt string
		if err := rows.Scan(
			&item.ID,
			&item.CustomerID,
			&item.CustomerName,
			&item.CustomerPhone,
			&item.PackageID,
			&item.PackageName,
			&item.PackageSpeed,
			&item.Period,
			&item.InvoiceNumber,
			&item.Amount,
			&item.DueDate,
			&item.Status,
			&paidAt,
			&item.PaymentMethod,
			&proofPath,
			&item.CustomerStatus,
			&trialStartedAt,
			&item.TrialDays,
		); err != nil {
			return nil, fmt.Errorf("scan automation candidate: %w", err)
		}
		if paidAt.Valid {
			item.PaidAt = &paidAt.String
		}
		if proofPath.Valid {
			item.ProofPath = &proofPath.String
		}
		if strings.TrimSpace(trialStartedAt) != "" {
			item.TrialStartedAt = &trialStartedAt
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) UpdateCustomerStatus(ctx context.Context, customerID int64, status string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET status = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, status, customerID)
	if err != nil {
		return fmt.Errorf("update customer status from billing: %w", err)
	}
	return nil
}

func (r Repository) findCandidates(ctx context.Context, period string) ([]billCandidate, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo,
		       c.diskon, c.referral_balance
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		WHERE c.status IN ('active', 'limit')
		  AND COALESCE(c.is_trial, 0) = 0
		  AND NOT EXISTS (
			SELECT 1
			FROM tagihan t
			WHERE t.pelanggan_id = c.id
			  AND t.periode = ?
		  )
		ORDER BY c.id ASC
	`, period)
	if err != nil {
		return nil, fmt.Errorf("find billing candidates: %w", err)
	}
	defer rows.Close()

	items := []billCandidate{}
	for rows.Next() {
		var item billCandidate
		if err := rows.Scan(
			&item.CustomerID,
			&item.CustomerName,
			&item.CustomerPhone,
			&item.PackageID,
			&item.PackageName,
			&item.PackageSpeed,
			&item.PackagePrice,
			&item.DueDay,
			&item.Diskon,
			&item.ReferralBalance,
		); err != nil {
			return nil, fmt.Errorf("scan bill candidate: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) findCandidateForCustomer(ctx context.Context, customerID int64, period string) (billCandidate, bool, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo,
		       c.diskon, c.referral_balance
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		WHERE c.id = ?
		  AND c.status IN ('active', 'limit')
		  AND NOT EXISTS (
			SELECT 1
			FROM tagihan t
			WHERE t.pelanggan_id = c.id
			  AND t.periode = ?
		  )
		LIMIT 1
	`, customerID, period)

	var item billCandidate
	if err := row.Scan(
		&item.CustomerID,
		&item.CustomerName,
		&item.CustomerPhone,
		&item.PackageID,
		&item.PackageName,
		&item.PackageSpeed,
		&item.PackagePrice,
		&item.DueDay,
		&item.Diskon,
		&item.ReferralBalance,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return billCandidate{}, false, nil
		}
		return billCandidate{}, false, fmt.Errorf("find customer billing candidate: %w", err)
	}

	return item, true, nil
}

func (r Repository) FindByCustomerAndPeriod(ctx context.Context, customerID int64, period string, menunggakDays int, now time.Time) (Bill, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path, t.diskon, t.diskon_referral
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		WHERE t.pelanggan_id = ?
		  AND t.periode = ?
		LIMIT 1
	`, customerID, period)

	item, err := scanBill(row, menunggakDays, now)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return Bill{}, ErrBillNotFound
		}
		return Bill{}, fmt.Errorf("find bill by customer and period: %w", err)
	}

	return item, nil
}

func (r Repository) paymentHistory(ctx context.Context, billID int64) ([]PaymentHistory, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, method, amount, paid_at, note, proof_path, created_by_user_id
		FROM payment_history
		WHERE tagihan_id = ?
		ORDER BY id DESC
	`, billID)
	if err != nil {
		return nil, fmt.Errorf("payment history: %w", err)
	}
	defer rows.Close()

	items := []PaymentHistory{}
	for rows.Next() {
		var item PaymentHistory
		var note sql.NullString
		var proof sql.NullString
		var createdBy sql.NullInt64
		if err := rows.Scan(&item.ID, &item.Method, &item.Amount, &item.PaidAt, &note, &proof, &createdBy); err != nil {
			return nil, fmt.Errorf("scan payment history: %w", err)
		}
		if note.Valid {
			item.Note = &note.String
		}
		if proof.Valid {
			item.ProofPath = &proof.String
		}
		if createdBy.Valid {
			value := createdBy.Int64
			item.CreatedBy = &value
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanBill(scanner interface {
	Scan(dest ...any) error
}, menunggakDays int, now time.Time) (Bill, error) {
	var item Bill
	var paidAt sql.NullString
	var proofPath sql.NullString
	if err := scanner.Scan(
		&item.ID,
		&item.CustomerID,
		&item.CustomerName,
		&item.CustomerPhone,
		&item.PackageID,
		&item.PackageName,
		&item.PackageSpeed,
		&item.Period,
		&item.InvoiceNumber,
		&item.Amount,
		&item.DueDate,
		&item.Status,
		&paidAt,
		&item.PaymentMethod,
		&proofPath,
		&item.Diskon,
		&item.DiskonReferral,
	); err != nil {
		return Bill{}, fmt.Errorf("scan bill: %w", err)
	}
	if paidAt.Valid {
		item.PaidAt = &paidAt.String
	}
	if proofPath.Valid {
		item.ProofPath = &proofPath.String
	}
	item.DisplayStatus = computeDisplayStatus(item.Status, item.DueDate, menunggakDays, now)
	return item, nil
}

func billSerial(ctx context.Context, tx *sql.Tx, customerID int64) (int, error) {
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM tagihan WHERE pelanggan_id = ?`, customerID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count customer bills: %w", err)
	}

	return count + 1, nil
}

func findBillForPayment(ctx context.Context, tx *sql.Tx, billID int64) (Bill, error) {
	row := tx.QueryRowContext(ctx, `
		SELECT id, pelanggan_id, nominal
		FROM tagihan
		WHERE id = ?
		LIMIT 1
	`, billID)

	var bill Bill
	if err := row.Scan(&bill.ID, &bill.CustomerID, &bill.Amount); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Bill{}, ErrBillNotFound
		}
		return Bill{}, fmt.Errorf("find bill for payment: %w", err)
	}

	return bill, nil
}

func unpaidCountForCustomer(ctx context.Context, tx *sql.Tx, customerID int64) (int, error) {
	var count int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM tagihan
		WHERE pelanggan_id = ?
		  AND status = 'belum_bayar'
	`, customerID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count unpaid customer bills: %w", err)
	}

	return count, nil
}
