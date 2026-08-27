package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Repository struct {
	DB *sql.DB
}

func (r Repository) List(ctx context.Context, menunggakDays int, now time.Time, opt FilterOptions) ([]Bill, int, error) {
	var conds []string
	var args []any

	if opt.CustomerID > 0 {
		conds = append(conds, "t.pelanggan_id = ?")
		args = append(args, opt.CustomerID)
	}

	if opt.Period != "" {
		conds = append(conds, "t.periode = ?")
		args = append(args, opt.Period)
	}

	if opt.Search != "" {
		conds = append(conds, "(c.nama LIKE ? OR t.invoice_number LIKE ?)")
		term := "%" + opt.Search + "%"
		args = append(args, term, term)
	}

	if opt.Status != "" {
		switch opt.Status {
		case "lunas":
			conds = append(conds, "t.status = 'lunas'")
		case "belum_bayar":
			conds = append(conds, "t.status = 'belum_bayar' AND CAST(julianday(?) - julianday(t.jatuh_tempo) AS INTEGER) <= 0")
			args = append(args, now.Format("2006-01-02"))
		case "belum_bayar_all":
			conds = append(conds, "t.status = 'belum_bayar'")
		case "jatuh_tempo":
			conds = append(conds, "t.status = 'belum_bayar' AND CAST(julianday(?) - julianday(t.jatuh_tempo) AS INTEGER) > 0 AND CAST(julianday(?) - julianday(t.jatuh_tempo) AS INTEGER) < ?")
			args = append(args, now.Format("2006-01-02"), now.Format("2006-01-02"), menunggakDays)
		case "menunggak":
			conds = append(conds, "t.status = 'belum_bayar' AND CAST(julianday(?) - julianday(t.jatuh_tempo) AS INTEGER) >= ?")
			args = append(args, now.Format("2006-01-02"), menunggakDays)
		}
	}

	whereClause := ""
	if len(conds) > 0 {
		whereClause = "WHERE " + strings.Join(conds, " AND ")
	}

	// 1. Query count
	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		%s
	`, whereClause)

	var total int
	err := r.DB.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count filtered bills: %w", err)
	}

	// 2. Query data
	selectQuery := fmt.Sprintf(`
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path, t.diskon, t.diskon_referral, c.status
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		%s
		ORDER BY t.id DESC
	`, whereClause)

	if opt.Limit > 0 {
		selectQuery += " LIMIT ? OFFSET ?"
		offset := (opt.Page - 1) * opt.Limit
		if offset < 0 {
			offset = 0
		}
		args = append(args, opt.Limit, offset)
	}

	rows, err := r.DB.QueryContext(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list filtered bills: %w", err)
	}
	defer rows.Close()

	items := []Bill{}
	for rows.Next() {
		item, err := scanBill(rows, menunggakDays, now)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}

	return items, total, rows.Err()
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
	if item.Status == "belum_bayar" && item.CustomerStatus == "pending" {
		item.DisplayStatus = "perpanjangan"
	} else if item.PaymentMethod == "perpanjangan" {
		item.DisplayStatus = "perpanjangan"
	}

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
		if candidate.TipeDiskon == "percent" {
			diskon = (candidate.PackagePrice * candidate.Diskon) / 100
		}
		if diskon < 0 {
			diskon = 0
		}
		afterDiskon := candidate.PackagePrice - diskon
		if afterDiskon < 0 {
			afterDiskon = 0
		}

		// Check for active voucher
		var cvID int64
		var voucherID int64
		var vAmount int
		var vType string
		var remainingCycles int
		var totalCycles int

		err = tx.QueryRowContext(ctx, `
			SELECT cv.id, cv.voucher_id, v.amount, v.type, cv.remaining_cycles, v.total_cycles
			FROM customer_vouchers cv
			INNER JOIN vouchers v ON v.id = cv.voucher_id
			INNER JOIN pelanggan c ON c.id = cv.pelanggan_id
			WHERE cv.pelanggan_id = ?
			  AND cv.status = 'active'
			  AND c.voucher_auto_apply = 1
			LIMIT 1
		`, candidate.CustomerID).Scan(&cvID, &voucherID, &vAmount, &vType, &remainingCycles, &totalCycles)

		hasVoucher := err == nil
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			_ = tx.Rollback()
			return 0, fmt.Errorf("check active voucher: %w", err)
		}

		diskonReferral := 0
		if hasVoucher {
			diskonReferral = vAmount
		} else {
			diskonReferral = candidate.VoucherDiscount
		}

		if diskonReferral > afterDiskon {
			diskonReferral = afterDiskon
		}
		if diskonReferral < 0 {
			diskonReferral = 0
		}

		finalAmount := afterDiskon - diskonReferral
		isPending := candidate.CustomerStatus == "pending"
		if isPending {
			finalAmount = finalAmount * 2
		}

		result, err := tx.ExecContext(ctx, `
			INSERT INTO tagihan (
				pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, diskon, diskon_referral, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar', ?, ?, CURRENT_TIMESTAMP)
		`, candidate.CustomerID, candidate.PackageID, period, invoiceNumber, finalAmount, dueDate.Format("2006-01-02"), diskon, diskonReferral)
		if err != nil {
			_ = tx.Rollback()
			return 0, fmt.Errorf("insert generated bill: %w", err)
		}

		billID, err := result.LastInsertId()
		if err != nil {
			_ = tx.Rollback()
			return 0, fmt.Errorf("get generated bill ID: %w", err)
		}

		if isPending {
			_, err = tx.ExecContext(ctx, `
				UPDATE tagihan
				SET status = 'lunas', payment_method = 'perpanjangan', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
				WHERE pelanggan_id = ? AND status = 'belum_bayar' AND id != ?
			`, candidate.CustomerID, billID)
			if err != nil {
				_ = tx.Rollback()
				return 0, fmt.Errorf("mark previous bills as perpanjangan: %w", err)
			}

			_, err = tx.ExecContext(ctx, `
				UPDATE pelanggan
				SET status = 'active', updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, candidate.CustomerID)
			if err != nil {
				_ = tx.Rollback()
				return 0, fmt.Errorf("reset customer status to active: %w", err)
			}
		}

		if hasVoucher {
			if vType != "permanent" {
				newRemaining := remainingCycles - 1
				status := "active"
				if newRemaining <= 0 {
					status = "completed"
				}
				_, err = tx.ExecContext(ctx, `
					UPDATE customer_vouchers
					SET remaining_cycles = ?, status = ?, updated_at = CURRENT_TIMESTAMP
					WHERE id = ?
				`, newRemaining, status, cvID)
				if err != nil {
					_ = tx.Rollback()
					return 0, fmt.Errorf("update customer voucher cycles: %w", err)
				}
			}

			cycleNumber := 1
			if vType != "permanent" {
				cycleNumber = totalCycles - remainingCycles + 1
			}
			_, err = tx.ExecContext(ctx, `
				INSERT INTO voucher_usage_logs (pelanggan_id, voucher_id, tagihan_id, amount_applied, cycle_number, created_at)
				VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			`, candidate.CustomerID, voucherID, billID, diskonReferral, cycleNumber)
			if err != nil {
				_ = tx.Rollback()
				return 0, fmt.Errorf("insert voucher usage log: %w", err)
			}
		} else if diskonReferral > 0 {
			_, err = tx.ExecContext(ctx, `
				UPDATE pelanggan
				SET voucher_discount = voucher_discount - ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, diskonReferral, candidate.CustomerID)
			if err != nil {
				_ = tx.Rollback()
				return 0, fmt.Errorf("deduct voucher discount: %w", err)
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

	var dueDate time.Time
	if candidate.IsTrial && candidate.TrialStartedAt != "" {
		trialStart, parseErr := time.Parse(time.RFC3339, candidate.TrialStartedAt)
		if parseErr != nil {
			trialStart, parseErr = time.Parse("2006-01-02 15:04:05", candidate.TrialStartedAt)
		}
		if parseErr == nil {
			trialGraceDays := 5 // default (3 days trial + 5 days grace)
			var graceStr string
			_ = tx.QueryRowContext(ctx, "SELECT value FROM pengaturan WHERE key = 'trial_overdue_grace_days'").Scan(&graceStr)
			if graceStr != "" {
				if val, convErr := strconv.Atoi(graceStr); convErr == nil {
					trialGraceDays = val
				}
			}
			dueDate = trialStart.AddDate(0, 0, candidate.TrialDays+trialGraceDays)
		} else {
			dueDate = resolveDueDate(periodTime, candidate.DueDay)
		}
	} else {
		dueDate = resolveDueDate(periodTime, candidate.DueDay)
	}

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
	if candidate.TipeDiskon == "percent" {
		diskon = (candidate.PackagePrice * candidate.Diskon) / 100
	}
	if diskon < 0 {
		diskon = 0
	}
	afterDiskon := candidate.PackagePrice - diskon
	if afterDiskon < 0 {
		afterDiskon = 0
	}

	// Check for active voucher
	var cvID int64
	var voucherID int64
	var vAmount int
	var vType string
	var remainingCycles int
	var totalCycles int

	err = tx.QueryRowContext(ctx, `
		SELECT cv.id, cv.voucher_id, v.amount, v.type, cv.remaining_cycles, v.total_cycles
		FROM customer_vouchers cv
		INNER JOIN vouchers v ON v.id = cv.voucher_id
		INNER JOIN pelanggan c ON c.id = cv.pelanggan_id
		WHERE cv.pelanggan_id = ?
		  AND cv.status = 'active'
		  AND c.voucher_auto_apply = 1
		LIMIT 1
	`, candidate.CustomerID).Scan(&cvID, &voucherID, &vAmount, &vType, &remainingCycles, &totalCycles)

	hasVoucher := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		_ = tx.Rollback()
		return Bill{}, false, fmt.Errorf("check active voucher: %w", err)
	}

	diskonReferral := 0
	if hasVoucher {
		diskonReferral = vAmount
	} else {
		diskonReferral = candidate.VoucherDiscount
	}

	if diskonReferral > afterDiskon {
		diskonReferral = afterDiskon
	}
	if diskonReferral < 0 {
		diskonReferral = 0
	}

	finalAmount := afterDiskon - diskonReferral
	isPending := candidate.CustomerStatus == "pending"
	if isPending {
		finalAmount = finalAmount * 2
	}

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

	if isPending {
		_, err = tx.ExecContext(ctx, `
			UPDATE tagihan
			SET status = 'lunas', payment_method = 'perpanjangan', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			WHERE pelanggan_id = ? AND status = 'belum_bayar' AND id != ?
		`, candidate.CustomerID, billID)
		if err != nil {
			_ = tx.Rollback()
			return Bill{}, false, fmt.Errorf("mark previous bills as perpanjangan: %w", err)
		}

		_, err = tx.ExecContext(ctx, `
			UPDATE pelanggan
			SET status = 'active', updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, candidate.CustomerID)
		if err != nil {
			_ = tx.Rollback()
			return Bill{}, false, fmt.Errorf("reset customer status to active: %w", err)
		}
	}

	if hasVoucher {
		if vType != "permanent" {
			newRemaining := remainingCycles - 1
			status := "active"
			if newRemaining <= 0 {
				status = "completed"
			}
			_, err = tx.ExecContext(ctx, `
				UPDATE customer_vouchers
				SET remaining_cycles = ?, status = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, newRemaining, status, cvID)
			if err != nil {
				_ = tx.Rollback()
				return Bill{}, false, fmt.Errorf("update customer voucher cycles: %w", err)
			}
		}

		cycleNumber := 1
		if vType != "permanent" {
			cycleNumber = totalCycles - remainingCycles + 1
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO voucher_usage_logs (pelanggan_id, voucher_id, tagihan_id, amount_applied, cycle_number, created_at)
			VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		`, candidate.CustomerID, voucherID, billID, diskonReferral, cycleNumber)
		if err != nil {
			_ = tx.Rollback()
			return Bill{}, false, fmt.Errorf("insert voucher usage log: %w", err)
		}
	} else if diskonReferral > 0 {
		_, err = tx.ExecContext(ctx, `
			UPDATE pelanggan
			SET voucher_discount = voucher_discount - ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, diskonReferral, candidate.CustomerID)
		if err != nil {
			_ = tx.Rollback()
			return Bill{}, false, fmt.Errorf("deduct voucher discount: %w", err)
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

func nullUserID(userID int64) any {
	if userID <= 0 {
		return nil
	}
	return userID
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
	`, now, method, nullUserID(userID), billID)
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
	`, bill.ID, method, bill.Amount, now, nullUserID(userID)); err != nil {
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
		       COALESCE(t.payment_method, ''), t.proof_path, c.status, COALESCE(c.trial_started_at, ''), COALESCE(c.trial_days, 0),
		       t.diskon, t.diskon_referral, (c.odp_id IS NOT NULL) AS has_odp,
		       EXISTS(SELECT 1 FROM payment_confirmations pc WHERE pc.tagihan_id = t.id AND pc.status = 'pending_review') AS has_pending_confirmation,
		       c.bypassed_isolir
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		INNER JOIN paket p ON p.id = t.paket_id
		WHERE t.status = 'belum_bayar'
		  AND c.status != 'wifi_umum'
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
			&item.Diskon,
			&item.DiskonReferral,
			&item.HasODP,
			&item.HasPendingConfirmation,
			&item.BypassedIsolir,
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
	_, _ = r.DB.ExecContext(ctx, `UPDATE pelanggan SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE status = 'trial' AND COALESCE(is_trial, 0) = 0`)

	rows, err := r.DB.QueryContext(ctx, `
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo,
		       c.diskon, COALESCE(c.tipe_diskon, 'flat'), c.voucher_discount, c.status,
		       c.is_trial, COALESCE(c.trial_started_at, ''), c.trial_days
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		WHERE c.status IN ('active', 'limit', 'pending', 'trial')
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
			&item.TipeDiskon,
			&item.VoucherDiscount,
			&item.CustomerStatus,
			&item.IsTrial,
			&item.TrialStartedAt,
			&item.TrialDays,
		); err != nil {
			return nil, fmt.Errorf("scan bill candidate: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}


func (r Repository) findCandidateForCustomer(ctx context.Context, customerID int64, period string) (billCandidate, bool, error) {
	_, _ = r.DB.ExecContext(ctx, `UPDATE pelanggan SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'trial' AND COALESCE(is_trial, 0) = 0`, customerID)

	row := r.DB.QueryRowContext(ctx, `
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo,
		       c.diskon, COALESCE(c.tipe_diskon, 'flat'), c.voucher_discount, c.status,
		       c.is_trial, COALESCE(c.trial_started_at, ''), c.trial_days
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		WHERE c.id = ?
		  AND c.status IN ('active', 'limit', 'pending', 'trial')
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
		&item.TipeDiskon,
		&item.VoucherDiscount,
		&item.CustomerStatus,
		&item.IsTrial,
		&item.TrialStartedAt,
		&item.TrialDays,
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
		       COALESCE(t.payment_method, ''), t.proof_path, t.diskon, t.diskon_referral, c.status
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
	var customerStatus string
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
		&customerStatus,
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
	if item.Status == "belum_bayar" && customerStatus == "pending" {
		item.DisplayStatus = "perpanjangan"
	} else if item.PaymentMethod == "perpanjangan" {
		item.DisplayStatus = "perpanjangan"
	}
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

func (r Repository) PrepareMarkPaid(ctx context.Context, billID int64, method string, userID int64) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tagihan
		SET status = 'pending_paid', payment_method = ?, paid_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND status = 'belum_bayar'
	`, method, nullUserID(userID), billID)
	if err != nil {
		return fmt.Errorf("prepare mark paid: %w", err)
	}
	return nil
}

func (r Repository) PrepareExtension(ctx context.Context, billID int64) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tagihan
		SET status = 'pending_extension', updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND status = 'belum_bayar'
	`, billID)
	if err != nil {
		return fmt.Errorf("prepare extension: %w", err)
	}
	return nil
}

func (r Repository) CancelPendingAction(ctx context.Context, billID int64) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tagihan
		SET status = 'belum_bayar', payment_method = '', paid_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND status IN ('pending_paid', 'pending_extension')
	`, billID)
	if err != nil {
		return fmt.Errorf("cancel pending action: %w", err)
	}
	return nil
}

type DelayedBill struct {
	ID             int64
	Status         string
	PaymentMethod  string
	PaidByUserID   int64
	UpdatedAt      string
}

func (r Repository) ListDelayedActions(ctx context.Context) ([]DelayedBill, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, status, COALESCE(payment_method, ''), COALESCE(paid_by_user_id, 0), updated_at
		FROM tagihan
		WHERE status IN ('pending_paid', 'pending_extension')
	`)
	if err != nil {
		return nil, fmt.Errorf("list delayed actions: %w", err)
	}
	defer rows.Close()

	var list []DelayedBill
	for rows.Next() {
		var b DelayedBill
		if err := rows.Scan(&b.ID, &b.Status, &b.PaymentMethod, &b.PaidByUserID, &b.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating delayed actions: %w", err)
	}
	return list, nil
}

func (r Repository) SetBillStatus(ctx context.Context, billID int64, status string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tagihan
		SET status = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, status, billID)
	if err != nil {
		return fmt.Errorf("set bill status: %w", err)
	}
	return nil
}

// GetPrimaryCustomerNameByPhone returns the name of the first registered customer with the given phone number.
func (r Repository) GetPrimaryCustomerNameByPhone(ctx context.Context, phone string) (string, error) {
	if strings.TrimSpace(phone) == "" {
		return "", nil
	}
	var name string
	err := r.DB.QueryRowContext(ctx, `
		SELECT nama FROM pelanggan
		WHERE nomor_wa = ?
		ORDER BY id ASC
		LIMIT 1
	`, phone).Scan(&name)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return name, nil
}

