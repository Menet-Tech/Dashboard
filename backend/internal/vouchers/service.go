package vouchers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrVoucherNotFound = errors.New("voucher not found")
var ErrAlreadyHasActiveVoucher = errors.New("pelanggan sudah memiliki voucher aktif")

type Voucher struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"`
	Amount      int    `json:"amount"`
	Type        string `json:"type"` // 'one-time', 'multi-use', 'permanent'
	TotalCycles int    `json:"total_cycles"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at,omitempty"`
}

type CustomerVoucher struct {
	ID              int64  `json:"id"`
	CustomerID      int64  `json:"pelanggan_id"`
	CustomerName    string `json:"customer_name,omitempty"`
	VoucherID       int64  `json:"voucher_id"`
	VoucherCode     string `json:"voucher_code,omitempty"`
	VoucherAmount   int    `json:"voucher_amount,omitempty"`
	RemainingCycles int    `json:"remaining_cycles"`
	Status          string `json:"status"` // 'active', 'completed'
	CreatedAt       string `json:"created_at"`
}

type UsageLog struct {
	ID            int64  `json:"id"`
	CustomerID    int64  `json:"pelanggan_id"`
	CustomerName  string `json:"customer_name"`
	VoucherID     int64  `json:"voucher_id"`
	VoucherCode   string `json:"voucher_code"`
	TagihanID     int64  `json:"tagihan_id"`
	InvoiceNumber string `json:"invoice_number"`
	AmountApplied int    `json:"amount_applied"`
	CycleNumber   int    `json:"cycle_number"`
	CreatedAt     string `json:"created_at"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Voucher, error) {
	rows, err := s.Repository.DB.QueryContext(ctx, `
		SELECT id, code, amount, type, total_cycles, COALESCE(description, ''), created_at
		FROM vouchers
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list vouchers: %w", err)
	}
	defer rows.Close()

	items := []Voucher{}
	for rows.Next() {
		var item Voucher
		if err := rows.Scan(&item.ID, &item.Code, &item.Amount, &item.Type, &item.TotalCycles, &item.Description, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s Service) Create(ctx context.Context, v Voucher) (Voucher, error) {
	v.Code = strings.ToUpper(strings.TrimSpace(v.Code))
	if v.Code == "" {
		return Voucher{}, errors.New("voucher code is required")
	}
	if v.Amount <= 0 {
		return Voucher{}, errors.New("amount must be greater than zero")
	}
	if v.Type != "one-time" && v.Type != "multi-use" && v.Type != "permanent" {
		return Voucher{}, errors.New("invalid type (must be one-time, multi-use, or permanent)")
	}
	switch v.Type {
	case "one-time":
		v.TotalCycles = 1
	case "permanent":
		v.TotalCycles = 0
	}

	result, err := s.Repository.DB.ExecContext(ctx, `
		INSERT INTO vouchers (code, amount, type, total_cycles, description)
		VALUES (?, ?, ?, ?, ?)
	`, v.Code, v.Amount, v.Type, v.TotalCycles, v.Description)
	if err != nil {
		return Voucher{}, fmt.Errorf("create voucher: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Voucher{}, err
	}
	v.ID = id
	return v, nil
}

func (s Service) Delete(ctx context.Context, id int64) error {
	result, err := s.Repository.DB.ExecContext(ctx, `DELETE FROM vouchers WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete voucher: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrVoucherNotFound
	}
	return nil
}

func (s Service) Claim(ctx context.Context, customerID int64, code string) (CustomerVoucher, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return CustomerVoucher{}, errors.New("voucher code is required")
	}

	// 1. Fetch voucher details
	var v Voucher
	err := s.Repository.DB.QueryRowContext(ctx, `
		SELECT id, code, amount, type, total_cycles, COALESCE(description, '')
		FROM vouchers
		WHERE code = ?
		LIMIT 1
	`, code).Scan(&v.ID, &v.Code, &v.Amount, &v.Type, &v.TotalCycles, &v.Description)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CustomerVoucher{}, ErrVoucherNotFound
		}
		return CustomerVoucher{}, err
	}

	// 1.5. Check if customer has a special discount (special user)
	var diskon int
	err = s.Repository.DB.QueryRowContext(ctx, `SELECT diskon FROM pelanggan WHERE id = ?`, customerID).Scan(&diskon)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CustomerVoucher{}, errors.New("customer not found")
		}
		return CustomerVoucher{}, err
	}
	if diskon > 0 {
		return CustomerVoucher{}, errors.New("pelanggan khusus tidak diperbolehkan mengklaim atau menggunakan voucher")
	}

	// 2. Check if customer already has active voucher
	var count int
	err = s.Repository.DB.QueryRowContext(ctx, `
		SELECT COUNT(1) FROM customer_vouchers
		WHERE pelanggan_id = ? AND status = 'active'
	`, customerID).Scan(&count)
	if err != nil {
		return CustomerVoucher{}, err
	}
	if count > 0 {
		return CustomerVoucher{}, ErrAlreadyHasActiveVoucher
	}

	// 3. Link voucher to customer
	result, err := s.Repository.DB.ExecContext(ctx, `
		INSERT INTO customer_vouchers (pelanggan_id, voucher_id, remaining_cycles, status, updated_at)
		VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
	`, customerID, v.ID, v.TotalCycles)
	if err != nil {
		return CustomerVoucher{}, fmt.Errorf("claim voucher association: %w", err)
	}

	cvID, err := result.LastInsertId()
	if err != nil {
		return CustomerVoucher{}, err
	}

	return CustomerVoucher{
		ID:              cvID,
		CustomerID:      customerID,
		VoucherID:       v.ID,
		VoucherCode:     v.Code,
		VoucherAmount:   v.Amount,
		RemainingCycles: v.TotalCycles,
		Status:          "active",
	}, nil
}

func (s Service) ToggleAutoApply(ctx context.Context, customerID int64, autoApply bool) error {
	val := 0
	if autoApply {
		val = 1
	}
	_, err := s.Repository.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET voucher_auto_apply = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, val, customerID)
	if err != nil {
		return fmt.Errorf("toggle voucher auto apply: %w", err)
	}
	return nil
}

func (s Service) ListUsageLogs(ctx context.Context) ([]UsageLog, error) {
	rows, err := s.Repository.DB.QueryContext(ctx, `
		SELECT l.id, l.pelanggan_id, c.nama, l.voucher_id, v.code, l.tagihan_id, t.invoice_number, l.amount_applied, l.cycle_number, l.created_at
		FROM voucher_usage_logs l
		INNER JOIN pelanggan c ON c.id = l.pelanggan_id
		INNER JOIN vouchers v ON v.id = l.voucher_id
		INNER JOIN tagihan t ON t.id = l.tagihan_id
		ORDER BY l.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list voucher logs: %w", err)
	}
	defer rows.Close()

	items := []UsageLog{}
	for rows.Next() {
		var item UsageLog
		if err := rows.Scan(&item.ID, &item.CustomerID, &item.CustomerName, &item.VoucherID, &item.VoucherCode, &item.TagihanID, &item.InvoiceNumber, &item.AmountApplied, &item.CycleNumber, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s Service) ListActiveCustomerVouchers(ctx context.Context) ([]CustomerVoucher, error) {
	rows, err := s.Repository.DB.QueryContext(ctx, `
		SELECT cv.id, cv.pelanggan_id, c.nama, cv.voucher_id, v.code, v.amount, cv.remaining_cycles, cv.status, cv.created_at
		FROM customer_vouchers cv
		INNER JOIN pelanggan c ON c.id = cv.pelanggan_id
		INNER JOIN vouchers v ON v.id = cv.voucher_id
		ORDER BY cv.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list customer vouchers: %w", err)
	}
	defer rows.Close()

	items := []CustomerVoucher{}
	for rows.Next() {
		var item CustomerVoucher
		if err := rows.Scan(cvIDScanDest(&item)...); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func cvIDScanDest(cv *CustomerVoucher) []any {
	return []any{
		&cv.ID,
		&cv.CustomerID,
		&cv.CustomerName,
		&cv.VoucherID,
		&cv.VoucherCode,
		&cv.VoucherAmount,
		&cv.RemainingCycles,
		&cv.Status,
		&cv.CreatedAt,
	}
}
