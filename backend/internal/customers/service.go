package customers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrCustomerNotFound = errors.New("customer not found")

type Customer struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	PackageID      int64   `json:"package_id"`
	PackageName    string  `json:"package_name,omitempty"`
	PackagePrice   int     `json:"package_price,omitempty"`
	UserPPPoE      string  `json:"user_pppoe"`
	PasswordPPPoE  string  `json:"password_pppoe"`
	WhatsApp       string  `json:"whatsapp"`
	SNOnt          string  `json:"sn_ont"`
	DueDay         int     `json:"due_day"`
	Status         string  `json:"status"`
	Address        string  `json:"address"`
	IsTrial        bool    `json:"is_trial"`
	TrialStartedAt *string `json:"trial_started_at,omitempty"`
	TrialDays      int     `json:"trial_days"`
	Diskon         int     `json:"diskon"`
	ReferredByID   *int64  `json:"referred_by_id,omitempty"`
	ReferralBalance int     `json:"referral_balance"`
	ReferralCode   string  `json:"referral_code,omitempty"`
	ReferredByName string  `json:"referred_by_name,omitempty"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Customer, error) {
	return s.Repository.List(ctx)
}

func (s Service) Create(ctx context.Context, customer Customer) (Customer, error) {
	if err := validateCustomer(customer); err != nil {
		return Customer{}, err
	}

	return s.Repository.Create(ctx, normalizeCustomer(customer))
}

func (s Service) Update(ctx context.Context, id int64, customer Customer) (Customer, error) {
	if err := validateCustomer(customer); err != nil {
		return Customer{}, err
	}

	return s.Repository.Update(ctx, id, normalizeCustomer(customer))
}

func (s Service) UpdateStatus(ctx context.Context, id int64, status string) error {
	if !isValidStatus(status) {
		return errors.New("customer status is invalid")
	}

	return s.Repository.UpdateStatus(ctx, id, status)
}

// ListTrialExpired returns all customers whose trial period has expired
func (s Service) ListTrialExpired(ctx context.Context, now time.Time) ([]Customer, error) {
	return s.Repository.ListTrialExpired(ctx, now)
}

// EndTrial marks customer trial as finished
func (s Service) EndTrial(ctx context.Context, id int64) error {
	return s.Repository.EndTrial(ctx, id)
}

func normalizeCustomer(customer Customer) Customer {
	customer.Name = strings.TrimSpace(customer.Name)
	customer.UserPPPoE = strings.TrimSpace(customer.UserPPPoE)
	customer.PasswordPPPoE = strings.TrimSpace(customer.PasswordPPPoE)
	customer.WhatsApp = strings.TrimSpace(customer.WhatsApp)
	customer.SNOnt = strings.TrimSpace(customer.SNOnt)
	customer.Address = strings.TrimSpace(customer.Address)
	customer.Status = strings.TrimSpace(customer.Status)
	return customer
}

func validateCustomer(customer Customer) error {
	if strings.TrimSpace(customer.Name) == "" {
		return errors.New("customer name is required")
	}

	if customer.PackageID <= 0 {
		return errors.New("package is required")
	}

	if customer.DueDay < 1 || customer.DueDay > 31 {
		return errors.New("due day must be between 1 and 31")
	}

	if !isValidStatus(customer.Status) {
		return errors.New("customer status is invalid")
	}

	return nil
}

func isValidStatus(status string) bool {
	switch status {
	case "active", "limit", "inactive":
		return true
	default:
		return false
	}
}

func (r Repository) List(ctx context.Context) ([]Customer, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT c.id, c.nama, c.paket_id, p.nama, p.harga, COALESCE(c.user_pppoe, ''),
		       COALESCE(c.password_pppoe, ''), COALESCE(c.nomor_wa, ''), COALESCE(c.sn_ont, ''),
		       c.tgl_jatuh_tempo, c.status, COALESCE(c.alamat, ''), c.is_trial, COALESCE(c.trial_started_at, ''), c.trial_days,
		       c.diskon, c.referred_by_id, c.referral_balance, COALESCE(c.referral_code, ''), COALESCE(ref.nama, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		LEFT JOIN pelanggan ref ON ref.id = c.referred_by_id
		ORDER BY c.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list customers: %w", err)
	}
	defer rows.Close()

	items := []Customer{}
	for rows.Next() {
		var item Customer
		var isTrial int
		var trialStartedAt string
		var referredByID sql.NullInt64
		var referralCode sql.NullString
		var referredByName sql.NullString
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.PackageID,
			&item.PackageName,
			&item.PackagePrice,
			&item.UserPPPoE,
			&item.PasswordPPPoE,
			&item.WhatsApp,
			&item.SNOnt,
			&item.DueDay,
			&item.Status,
			&item.Address,
			&isTrial,
			&trialStartedAt,
			&item.TrialDays,
			&item.Diskon,
			&referredByID,
			&item.ReferralBalance,
			&referralCode,
			&referredByName,
		); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		item.IsTrial = isTrial != 0
		if trialStartedAt != "" {
			item.TrialStartedAt = &trialStartedAt
		}
		if referredByID.Valid {
			item.ReferredByID = &referredByID.Int64
		}
		if referralCode.Valid {
			item.ReferralCode = referralCode.String
		}
		if referredByName.Valid {
			item.ReferredByName = referredByName.String
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	// Set default trial values
	trialDays := customer.TrialDays
	if trialDays <= 0 {
		trialDays = 3
	}

	referralCode := strings.TrimSpace(customer.ReferralCode)
	if referralCode == "" {
		cleanName := ""
		for _, char := range strings.ToUpper(customer.Name) {
			if (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') {
				cleanName += string(char)
			}
		}
		if len(cleanName) > 6 {
			cleanName = cleanName[:6]
		}
		referralCode = fmt.Sprintf("REF-%s-%d", cleanName, time.Now().UnixNano()%10000)
	}

	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return Customer{}, fmt.Errorf("begin create customer tx: %w", err)
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO pelanggan (
			nama, paket_id, user_pppoe, password_pppoe, nomor_wa, sn_ont, tgl_jatuh_tempo, status, alamat,
			is_trial, trial_started_at, trial_days, diskon, referred_by_id, referral_balance, referral_code, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address, 1, trialDays, customer.Diskon, customer.ReferredByID, customer.ReferralBalance, referralCode)
	if err != nil {
		_ = tx.Rollback()
		return Customer{}, fmt.Errorf("create customer: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return Customer{}, fmt.Errorf("get customer id: %w", err)
	}

	// Reward referrer
	if customer.ReferredByID != nil {
		_, err = tx.ExecContext(ctx, `
			UPDATE pelanggan
			SET referral_balance = referral_balance + 50000, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, *customer.ReferredByID)
		if err != nil {
			_ = tx.Rollback()
			return Customer{}, fmt.Errorf("reward referrer: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return Customer{}, fmt.Errorf("commit create customer tx: %w", err)
	}

	customer.ID = id
	customer.IsTrial = true
	now := time.Now().UTC().Format(time.RFC3339)
	customer.TrialStartedAt = &now
	customer.TrialDays = trialDays
	customer.ReferralCode = referralCode

	return customer, nil
}

func (r Repository) Update(ctx context.Context, id int64, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	result, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET nama = ?, paket_id = ?, user_pppoe = ?, password_pppoe = ?, nomor_wa = ?, sn_ont = ?, tgl_jatuh_tempo = ?, status = ?, alamat = ?,
		    diskon = ?, referred_by_id = ?, referral_balance = ?, referral_code = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address,
		customer.Diskon, customer.ReferredByID, customer.ReferralBalance, customer.ReferralCode, id)
	if err != nil {
		return Customer{}, fmt.Errorf("update customer: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Customer{}, fmt.Errorf("customer update rows affected: %w", err)
	}

	if affected == 0 {
		return Customer{}, ErrCustomerNotFound
	}

	customer.ID = id
	return customer, nil
}

func (r Repository) UpdateStatus(ctx context.Context, id int64, status string) error {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET status = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, status, id)
	if err != nil {
		return fmt.Errorf("update customer status: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("customer status rows affected: %w", err)
	}

	if affected == 0 {
		return ErrCustomerNotFound
	}

	return nil
}

func (r Repository) ensurePackageExists(ctx context.Context, packageID int64) error {
	var count int
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM paket WHERE id = ?`, packageID).Scan(&count); err != nil {
		return fmt.Errorf("check package existence: %w", err)
	}

	if count == 0 {
		return errors.New("selected package does not exist")
	}

	return nil
}

// ListTrialExpired returns all customers whose trial period has expired
func (r Repository) ListTrialExpired(ctx context.Context, now time.Time) ([]Customer, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT c.id, c.nama, c.paket_id, p.nama, p.harga, COALESCE(c.user_pppoe, ''),
		       COALESCE(c.password_pppoe, ''), COALESCE(c.nomor_wa, ''), COALESCE(c.sn_ont, ''),
		       c.tgl_jatuh_tempo, c.status, COALESCE(c.alamat, ''), c.is_trial, COALESCE(c.trial_started_at, ''), c.trial_days,
		       c.diskon, c.referred_by_id, c.referral_balance, COALESCE(c.referral_code, ''), COALESCE(ref.nama, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		LEFT JOIN pelanggan ref ON ref.id = c.referred_by_id
		WHERE c.is_trial = 1
		  AND c.trial_started_at IS NOT NULL
		  AND datetime(c.trial_started_at, '+' || c.trial_days || ' days') <= ?
		ORDER BY c.id ASC
	`, now.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, fmt.Errorf("list trial expired customers: %w", err)
	}
	defer rows.Close()

	items := []Customer{}
	for rows.Next() {
		var item Customer
		var isTrial int
		var trialStartedAt string
		var referredByID sql.NullInt64
		var referralCode sql.NullString
		var referredByName sql.NullString
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.PackageID,
			&item.PackageName,
			&item.PackagePrice,
			&item.UserPPPoE,
			&item.PasswordPPPoE,
			&item.WhatsApp,
			&item.SNOnt,
			&item.DueDay,
			&item.Status,
			&item.Address,
			&isTrial,
			&trialStartedAt,
			&item.TrialDays,
			&item.Diskon,
			&referredByID,
			&item.ReferralBalance,
			&referralCode,
			&referredByName,
		); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		item.IsTrial = isTrial != 0
		if trialStartedAt != "" {
			item.TrialStartedAt = &trialStartedAt
		}
		if referredByID.Valid {
			item.ReferredByID = &referredByID.Int64
		}
		if referralCode.Valid {
			item.ReferralCode = referralCode.String
		}
		if referredByName.Valid {
			item.ReferredByName = referredByName.String
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

// EndTrial marks the customer trial as finished
func (r Repository) EndTrial(ctx context.Context, id int64) error {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET is_trial = 0, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, id)
	if err != nil {
		return fmt.Errorf("end trial: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("end trial rows affected: %w", err)
	}

	if affected == 0 {
		return ErrCustomerNotFound
	}

	return nil
}
