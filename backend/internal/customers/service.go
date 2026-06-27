package customers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"log/slog"

	"menettech/dashboard/backend/internal/mikrotik"
	"menettech/dashboard/backend/internal/settings"
)

var ErrCustomerNotFound = errors.New("customer not found")

type Customer struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	PackageID       int64   `json:"package_id"`
	PackageName     string  `json:"package_name,omitempty"`
	PackagePrice    int     `json:"package_price,omitempty"`
	UserPPPoE       string  `json:"user_pppoe"`
	PasswordPPPoE   string  `json:"password_pppoe"`
	WhatsApp        string  `json:"whatsapp"`
	Email           string  `json:"email"`
	SNOnt           string  `json:"sn_ont"`
	DueDay          int     `json:"due_day"`
	Status          string  `json:"status"`
	Address         string  `json:"address"`
	IsTrial         bool    `json:"is_trial"`
	TrialStartedAt  *string `json:"trial_started_at,omitempty"`
	TrialDays       int     `json:"trial_days"`
	Diskon          int     `json:"diskon"`
	TipeDiskon      string  `json:"tipe_diskon"`
	ReferredByID    *int64  `json:"referred_by_id,omitempty"`
	ReferralBalance int     `json:"referral_balance"`
	ReferralCode    string  `json:"referral_code,omitempty"`
	ReferredByName  string  `json:"referred_by_name,omitempty"`
	VoucherDiscount int     `json:"voucher_discount"`
	OntStatus       string  `json:"ont_status"`
	OntIP           string  `json:"ont_ip"`
	OntUptime       string  `json:"ont_uptime"`
	OntRxPower      string  `json:"ont_rx_power"`
	OntTxPower      string  `json:"ont_tx_power"`
	PppoeStatus     string  `json:"pppoe_status"`
	PppoeIP         string  `json:"pppoe_ip"`
	PppoeUptime     string  `json:"pppoe_uptime"`
	LastSyncAt      string  `json:"last_sync_at"`
	OdpID            *int64  `json:"odp_id,omitempty"`
	OdpName          string  `json:"odp_name,omitempty"`
	OdpPort          *int    `json:"odp_port,omitempty"`
	VoucherAutoApply int     `json:"voucher_auto_apply"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
	Settings   settings.Service
}

func (s Service) List(ctx context.Context) ([]Customer, error) {
	return s.Repository.List(ctx)
}

func (s Service) FindByID(ctx context.Context, id int64) (Customer, error) {
	return s.Repository.FindByID(ctx, id)
}

func (s Service) Create(ctx context.Context, customer Customer) (Customer, error) {
	if err := validateCustomer(customer); err != nil {
		return Customer{}, err
	}

	// Fetch trial settings
	trialEnabled := true
	trialPeriodDays := 3

	if s.Settings.Repository.DB != nil {
		enabledStr, err := s.Settings.GetString(ctx, settings.KeyTrialEnabled)
		if err == nil && enabledStr == "0" {
			trialEnabled = false
		}

		days, err := s.Settings.GetInt(ctx, settings.KeyTrialPeriodDays)
		if err == nil && days > 0 {
			trialPeriodDays = days
		}
	}

	if trialEnabled {
		customer.IsTrial = true
		customer.TrialDays = trialPeriodDays
	} else {
		customer.IsTrial = false
		customer.TrialDays = 0
		customer.TrialStartedAt = nil
	}

	created, err := s.Repository.Create(ctx, normalizeCustomer(customer))
	if err != nil {
		return Customer{}, err
	}

	go func(c Customer) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = s.SyncToMikrotik(bgCtx, c)
	}(created)

	return created, nil
}

func (s Service) Update(ctx context.Context, id int64, customer Customer) (Customer, error) {
	if err := validateCustomer(customer); err != nil {
		return Customer{}, err
	}

	updated, err := s.Repository.Update(ctx, id, normalizeCustomer(customer))
	if err != nil {
		return Customer{}, err
	}

	go func(c Customer) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = s.SyncToMikrotik(bgCtx, c)
	}(updated)

	return updated, nil
}

func (s Service) UpdateStatus(ctx context.Context, id int64, status string) error {
	if !isValidStatus(status) {
		return errors.New("customer status is invalid")
	}

	if err := s.Repository.UpdateStatus(ctx, id, status); err != nil {
		return err
	}

	customer, err := s.FindByID(ctx, id)
	if err == nil {
		go func(c Customer) {
			bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_ = s.SyncToMikrotik(bgCtx, c)
		}(customer)
	}

	return nil
}

func (s Service) Delete(ctx context.Context, id int64) error {
	customer, err := s.FindByID(ctx, id)
	if err != nil {
		return err
	}

	// Delete from Mikrotik asynchronously
	go func(c Customer) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = s.DeleteFromMikrotik(bgCtx, c)
	}(customer)

	// Delete from local database
	return s.Repository.Delete(ctx, id)
}

// DeleteFromMikrotik connects to all active RouterOS units and deletes the customer's PPPoE secret.
func (s Service) DeleteFromMikrotik(ctx context.Context, customer Customer) error {
	if s.Repository.DB == nil {
		return nil
	}

	username := strings.TrimSpace(customer.UserPPPoE)
	if username == "" {
		return nil
	}

	// Fetch active routers from mikrotik_routers table
	routerSvc := mikrotik.NewRouterService(s.Repository.DB)
	routers, err := routerSvc.ListActive(ctx)

	// Fallback to legacy single router if list is empty
	if err != nil || len(routers) == 0 {
		host, _ := s.Settings.GetString(ctx, settings.KeyMikrotikHost)
		user, _ := s.Settings.GetString(ctx, settings.KeyMikrotikUser)
		pass, _ := s.Settings.GetString(ctx, settings.KeyMikrotikPass)

		if strings.TrimSpace(host) != "" && strings.TrimSpace(user) != "" {
			routers = append(routers, mikrotik.Router{
				Name:     "Router Legacy",
				Host:     host,
				Username: user,
				Password: pass,
				IsActive: true,
			})
		}
	}

	if len(routers) == 0 {
		return nil // No routers configured
	}

	var lastErr error
	for _, r := range routers {
		client := mikrotik.NewClient(r.Host, r.Username, r.Password)
		if err := client.Connect(ctx); err != nil {
			slog.Error("failed to connect to MikroTik during delete", "router", r.Name, "customer", customer.Name, "error", err)
			lastErr = err
			continue
		}

		err = client.DeleteSecret(ctx, username)
		client.Close()

		if err != nil {
			slog.Error("failed to delete customer secret from MikroTik", "router", r.Name, "customer", customer.Name, "error", err)
			lastErr = err
		} else {
			slog.Info("successfully deleted customer secret from MikroTik", "router", r.Name, "customer", customer.Name)
		}
	}

	return lastErr
}


// SyncToMikrotik loads the router configuration, connects, and synchronizes the customer secret state.
func (s Service) SyncToMikrotik(ctx context.Context, customer Customer) error {
	if s.Repository.DB == nil {
		return nil
	}

	username := strings.TrimSpace(customer.UserPPPoE)
	if username == "" {
		return nil
	}

	// Fetch the package name to use as the profile
	var profileName string
	err := s.Repository.DB.QueryRowContext(ctx, "SELECT nama FROM paket WHERE id = ?", customer.PackageID).Scan(&profileName)
	if err != nil {
		profileName = "default"
	}

	if customer.Status == "limit" {
		isolirProfile, err := s.Settings.GetString(ctx, settings.KeyMikrotikIsolirProfile)
		if err == nil && strings.TrimSpace(isolirProfile) != "" {
			profileName = strings.TrimSpace(isolirProfile)
		} else {
			profileName = "isolir"
		}
	}

	// Fetch active routers from mikrotik_routers table
	routerSvc := mikrotik.NewRouterService(s.Repository.DB)
	routers, err := routerSvc.ListActive(ctx)

	// Fallback to legacy single router if list is empty
	if err != nil || len(routers) == 0 {
		host, _ := s.Settings.GetString(ctx, settings.KeyMikrotikHost)
		user, _ := s.Settings.GetString(ctx, settings.KeyMikrotikUser)
		pass, _ := s.Settings.GetString(ctx, settings.KeyMikrotikPass)

		if strings.TrimSpace(host) != "" && strings.TrimSpace(user) != "" {
			routers = append(routers, mikrotik.Router{
				Name:     "Router Legacy",
				Host:     host,
				Username: user,
				Password: pass,
				IsActive: true,
			})
		}
	}

	if len(routers) == 0 {
		return nil // No routers configured
	}

	var lastErr error
	for _, r := range routers {
		client := mikrotik.NewClient(r.Host, r.Username, r.Password)
		if err := client.Connect(ctx); err != nil {
			slog.Error("failed to connect to MikroTik during sync", "router", r.Name, "customer", customer.Name, "error", err)
			lastErr = err
			continue
		}

		err = client.SyncCustomer(ctx, username, customer.PasswordPPPoE, profileName, customer.Status)
		client.Close()

		if err != nil {
			slog.Error("failed to sync customer secret to MikroTik", "router", r.Name, "customer", customer.Name, "error", err)
			lastErr = err
		} else {
			slog.Info("successfully synced customer secret to MikroTik", "router", r.Name, "customer", customer.Name, "status", customer.Status)
		}
	}

	return lastErr
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
	customer.Email = strings.TrimSpace(customer.Email)
	customer.SNOnt = strings.TrimSpace(customer.SNOnt)
	customer.Address = strings.TrimSpace(customer.Address)
	customer.Status = strings.TrimSpace(customer.Status)

	if customer.OdpID != nil && *customer.OdpID > 0 {
		if customer.OdpPort == nil || *customer.OdpPort <= 0 {
			defaultPort := 1
			customer.OdpPort = &defaultPort
		}
	} else {
		customer.OdpID = nil
		customer.OdpPort = nil
	}

	if customer.ReferredByID != nil && *customer.ReferredByID <= 0 {
		customer.ReferredByID = nil
	}

	if customer.TipeDiskon == "" {
		customer.TipeDiskon = "flat"
	}

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

	if customer.TipeDiskon == "percent" && (customer.Diskon < 0 || customer.Diskon > 100) {
		return errors.New("percentage discount must be between 0 and 100")
	}

	if customer.Diskon < 0 {
		return errors.New("discount cannot be negative")
	}

	if customer.TipeDiskon != "" && customer.TipeDiskon != "flat" && customer.TipeDiskon != "percent" {
		return errors.New("invalid discount type")
	}

	return nil
}

func isValidStatus(status string) bool {
	switch status {
	case "active", "limit", "inactive", "pending":
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
		       c.diskon, COALESCE(c.tipe_diskon, 'flat'), c.referred_by_id, c.referral_balance, COALESCE(c.referral_code, ''), COALESCE(ref.nama, ''),
		       c.voucher_discount, COALESCE(c.ont_status, ''), COALESCE(c.ont_ip, ''), COALESCE(c.ont_uptime, ''),
		       COALESCE(c.ont_rx_power, ''), COALESCE(c.ont_tx_power, ''), COALESCE(c.pppoe_status, ''),
		       COALESCE(c.pppoe_ip, ''), COALESCE(c.pppoe_uptime, ''), COALESCE(c.last_sync_at, ''),
		       c.odp_id, COALESCE(o.nama, ''), c.voucher_auto_apply, c.odp_port, COALESCE(c.email, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		LEFT JOIN pelanggan ref ON ref.id = c.referred_by_id
		LEFT JOIN odp o ON o.id = c.odp_id
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
		var ontStatus sql.NullString
		var ontIP sql.NullString
		var ontUptime sql.NullString
		var ontRxPower sql.NullString
		var ontTxPower sql.NullString
		var pppoeStatus sql.NullString
		var pppoeIP sql.NullString
		var pppoeUptime sql.NullString
		var lastSyncAt sql.NullString
		var odpID sql.NullInt64
		var odpName sql.NullString
		var odpPort sql.NullInt64
		var email sql.NullString
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
			&item.TipeDiskon,
			&referredByID,
			&item.ReferralBalance,
			&referralCode,
			&referredByName,
			&item.VoucherDiscount,
			&ontStatus,
			&ontIP,
			&ontUptime,
			&ontRxPower,
			&ontTxPower,
			&pppoeStatus,
			&pppoeIP,
			&pppoeUptime,
			&lastSyncAt,
			&odpID,
			&odpName,
			&item.VoucherAutoApply,
			&odpPort,
			&email,
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
		item.Email = email.String
		item.OntStatus = ontStatus.String
		item.OntIP = ontIP.String
		item.OntUptime = ontUptime.String
		item.OntRxPower = ontRxPower.String
		item.OntTxPower = ontTxPower.String
		item.PppoeStatus = pppoeStatus.String
		item.PppoeIP = pppoeIP.String
		item.PppoeUptime = pppoeUptime.String
		item.LastSyncAt = lastSyncAt.String
		if odpID.Valid {
			item.OdpID = &odpID.Int64
		}
		if odpName.Valid {
			item.OdpName = odpName.String
		}
		if odpPort.Valid {
			val := int(odpPort.Int64)
			item.OdpPort = &val
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	// Set trial values based on customer object properties
	isTrialVal := 0
	var trialStartedAt *string
	trialDays := customer.TrialDays

	if customer.IsTrial {
		isTrialVal = 1
		if customer.TrialStartedAt != nil {
			trialStartedAt = customer.TrialStartedAt
		} else {
			nowStr := time.Now().UTC().Format(time.RFC3339)
			trialStartedAt = &nowStr
		}
		if trialDays <= 0 {
			trialDays = 3
		}
	} else {
		trialDays = 0
		trialStartedAt = nil
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
			is_trial, trial_started_at, trial_days, diskon, tipe_diskon, referred_by_id, referral_balance, referral_code, voucher_discount,
			ont_status, ont_ip, ont_uptime, ont_rx_power, ont_tx_power, pppoe_status, pppoe_ip, pppoe_uptime, last_sync_at, odp_id, odp_port, email, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address,
		isTrialVal, trialStartedAt, trialDays, customer.Diskon, customer.TipeDiskon, customer.ReferredByID, customer.ReferralBalance, referralCode, customer.VoucherDiscount,
		customer.OntStatus, customer.OntIP, customer.OntUptime, customer.OntRxPower, customer.OntTxPower, customer.PppoeStatus, customer.PppoeIP, customer.PppoeUptime, customer.LastSyncAt, customer.OdpID, customer.OdpPort, customer.Email)
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
	customer.TrialStartedAt = trialStartedAt
	customer.TrialDays = trialDays
	customer.ReferralCode = referralCode

	return customer, nil
}

// toNullString converts an empty string to a NULL sql value.
// This is important for UNIQUE-indexed nullable columns like referral_code:
// SQLite allows multiple NULL values but NOT multiple empty strings.
func toNullString(s string) sql.NullString {
	s = strings.TrimSpace(s)
	return sql.NullString{String: s, Valid: s != ""}
}

func (r Repository) Update(ctx context.Context, id int64, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	result, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET nama = ?, paket_id = ?, user_pppoe = ?, password_pppoe = ?, nomor_wa = ?, sn_ont = ?, tgl_jatuh_tempo = ?, status = ?, alamat = ?,
		    diskon = ?, tipe_diskon = ?, referred_by_id = ?, referral_balance = ?, referral_code = ?, voucher_discount = ?,
		    ont_status = ?, ont_ip = ?, ont_uptime = ?, ont_rx_power = ?, ont_tx_power = ?, pppoe_status = ?, pppoe_ip = ?, pppoe_uptime = ?, last_sync_at = ?,
		    odp_id = ?, odp_port = ?, voucher_auto_apply = ?, email = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address,
		customer.Diskon, customer.TipeDiskon, customer.ReferredByID, customer.ReferralBalance, toNullString(customer.ReferralCode), customer.VoucherDiscount,
		customer.OntStatus, customer.OntIP, customer.OntUptime, customer.OntRxPower, customer.OntTxPower, customer.PppoeStatus, customer.PppoeIP, customer.PppoeUptime, customer.LastSyncAt,
		customer.OdpID, customer.OdpPort, customer.VoucherAutoApply, customer.Email, id)
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

// UpdateSyncFields updates only the device/connection status fields that the background
// worker polls. It intentionally skips full validation and MikroTik sync to avoid
// unnecessary load on every polling cycle.
func (s Service) UpdateSyncFields(ctx context.Context, id int64, c Customer) error {
	_, err := s.Repository.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET ont_status = ?, ont_ip = ?, ont_uptime = ?, ont_rx_power = ?, ont_tx_power = ?,
		    pppoe_status = ?, pppoe_ip = ?, pppoe_uptime = ?, last_sync_at = ?
		WHERE id = ?
	`, c.OntStatus, c.OntIP, c.OntUptime, c.OntRxPower, c.OntTxPower,
		c.PppoeStatus, c.PppoeIP, c.PppoeUptime, c.LastSyncAt, id)
	if err != nil {
		return fmt.Errorf("update sync fields: %w", err)
	}
	return nil
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

func (r Repository) Delete(ctx context.Context, id int64) error {
	result, err := r.DB.ExecContext(ctx, "DELETE FROM pelanggan WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete customer: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete customer rows affected: %w", err)
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
		       c.diskon, COALESCE(c.tipe_diskon, 'flat'), c.referred_by_id, c.referral_balance, COALESCE(c.referral_code, ''), COALESCE(ref.nama, ''),
		       c.voucher_discount, COALESCE(c.ont_status, ''), COALESCE(c.ont_ip, ''), COALESCE(c.ont_uptime, ''),
		       COALESCE(c.ont_rx_power, ''), COALESCE(c.ont_tx_power, ''), COALESCE(c.pppoe_status, ''),
		       COALESCE(c.pppoe_ip, ''), COALESCE(c.pppoe_uptime, ''), COALESCE(c.last_sync_at, ''),
		       c.odp_id, COALESCE(o.nama, ''), c.voucher_auto_apply, COALESCE(c.email, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		LEFT JOIN pelanggan ref ON ref.id = c.referred_by_id
		LEFT JOIN odp o ON o.id = c.odp_id
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
		var ontStatus sql.NullString
		var ontIP sql.NullString
		var ontUptime sql.NullString
		var ontRxPower sql.NullString
		var ontTxPower sql.NullString
		var pppoeStatus sql.NullString
		var pppoeIP sql.NullString
		var pppoeUptime sql.NullString
		var lastSyncAt sql.NullString
		var odpID sql.NullInt64
		var odpName sql.NullString
		var email sql.NullString
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
			&item.TipeDiskon,
			&referredByID,
			&item.ReferralBalance,
			&referralCode,
			&referredByName,
			&item.VoucherDiscount,
			&ontStatus,
			&ontIP,
			&ontUptime,
			&ontRxPower,
			&ontTxPower,
			&pppoeStatus,
			&pppoeIP,
			&pppoeUptime,
			&lastSyncAt,
			&odpID,
			&odpName,
			&item.VoucherAutoApply,
			&email,
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
		item.Email = email.String
		item.OntStatus = ontStatus.String
		item.OntIP = ontIP.String
		item.OntUptime = ontUptime.String
		item.OntRxPower = ontRxPower.String
		item.OntTxPower = ontTxPower.String
		item.PppoeStatus = pppoeStatus.String
		item.PppoeIP = pppoeIP.String
		item.PppoeUptime = pppoeUptime.String
		item.LastSyncAt = lastSyncAt.String
		if odpID.Valid {
			item.OdpID = &odpID.Int64
		}
		if odpName.Valid {
			item.OdpName = odpName.String
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

func (r Repository) FindByID(ctx context.Context, id int64) (Customer, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT c.id, c.nama, c.paket_id, p.nama, p.harga, COALESCE(c.user_pppoe, ''),
		       COALESCE(c.password_pppoe, ''), COALESCE(c.nomor_wa, ''), COALESCE(c.sn_ont, ''),
		       c.tgl_jatuh_tempo, c.status, COALESCE(c.alamat, ''), c.is_trial, COALESCE(c.trial_started_at, ''), c.trial_days,
		       c.diskon, COALESCE(c.tipe_diskon, 'flat'), c.referred_by_id, c.referral_balance, COALESCE(c.referral_code, ''), COALESCE(ref.nama, ''),
		       c.voucher_discount, COALESCE(c.ont_status, ''), COALESCE(c.ont_ip, ''), COALESCE(c.ont_uptime, ''),
		       COALESCE(c.ont_rx_power, ''), COALESCE(c.ont_tx_power, ''), COALESCE(c.pppoe_status, ''),
		       COALESCE(c.pppoe_ip, ''), COALESCE(c.pppoe_uptime, ''), COALESCE(c.last_sync_at, ''),
		       c.odp_id, COALESCE(o.nama, ''), c.voucher_auto_apply, c.odp_port, COALESCE(c.email, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		LEFT JOIN pelanggan ref ON ref.id = c.referred_by_id
		LEFT JOIN odp o ON o.id = c.odp_id
		WHERE c.id = ?
		LIMIT 1
	`, id)

	var item Customer
	var isTrial int
	var trialStartedAt string
	var referredByID sql.NullInt64
	var referralCode sql.NullString
	var referredByName sql.NullString
	var ontStatus sql.NullString
	var ontIP sql.NullString
	var ontUptime sql.NullString
	var ontRxPower sql.NullString
	var ontTxPower sql.NullString
	var pppoeStatus sql.NullString
	var pppoeIP sql.NullString
	var pppoeUptime sql.NullString
	var lastSyncAt sql.NullString
	var odpID sql.NullInt64
	var odpName sql.NullString
	var odpPort sql.NullInt64
	var email sql.NullString

	err := row.Scan(
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
		&item.TipeDiskon,
		&referredByID,
		&item.ReferralBalance,
		&referralCode,
		&referredByName,
		&item.VoucherDiscount,
		&ontStatus,
		&ontIP,
		&ontUptime,
		&ontRxPower,
		&ontTxPower,
		&pppoeStatus,
		&pppoeIP,
		&pppoeUptime,
		&lastSyncAt,
		&odpID,
		&odpName,
		&item.VoucherAutoApply,
		&odpPort,
		&email,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return Customer{}, ErrCustomerNotFound
		}
		return Customer{}, fmt.Errorf("find customer by id: %w", err)
	}

	item.IsTrial = isTrial != 0
	if trialStartedAt != "" {
		item.TrialStartedAt = &trialStartedAt
	}
	item.Email = email.String
	if referredByID.Valid {
		item.ReferredByID = &referredByID.Int64
	}
	if referralCode.Valid {
		item.ReferralCode = referralCode.String
	}
	if referredByName.Valid {
		item.ReferredByName = referredByName.String
	}
	item.OntStatus = ontStatus.String
	item.OntIP = ontIP.String
	item.OntUptime = ontUptime.String
	item.OntRxPower = ontRxPower.String
	item.OntTxPower = ontTxPower.String
	item.PppoeStatus = pppoeStatus.String
	item.PppoeIP = pppoeIP.String
	item.PppoeUptime = pppoeUptime.String
	item.LastSyncAt = lastSyncAt.String
	if odpID.Valid {
		item.OdpID = &odpID.Int64
	}
	if odpName.Valid {
		item.OdpName = odpName.String
	}
	if odpPort.Valid {
		val := int(odpPort.Int64)
		item.OdpPort = &val
	}

	return item, nil
}

// WithdrawReferral deducts referral balance points for cash withdrawal.
func (s Service) WithdrawReferral(ctx context.Context, id int64, amount int) error {
	if amount <= 0 {
		return errors.New("amount must be greater than zero")
	}

	tx, err := s.Repository.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin withdraw tx: %w", err)
	}
	defer tx.Rollback()

	var balance int
	err = tx.QueryRowContext(ctx, "SELECT referral_balance FROM pelanggan WHERE id = ?", id).Scan(&balance)
	if err != nil {
		if err == sql.ErrNoRows {
			return ErrCustomerNotFound
		}
		return err
	}

	if balance < amount {
		return errors.New("insufficient referral balance")
	}

	_, err = tx.ExecContext(ctx, "UPDATE pelanggan SET referral_balance = referral_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", amount, id)
	if err != nil {
		return fmt.Errorf("update referral balance: %w", err)
	}

	return tx.Commit()
}

// ConvertReferralToVoucher converts referral balance points to a one-time billing voucher discount.
func (s Service) ConvertReferralToVoucher(ctx context.Context, id int64, amount int) error {
	if amount <= 0 {
		return errors.New("amount must be greater than zero")
	}

	tx, err := s.Repository.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin convert tx: %w", err)
	}
	defer tx.Rollback()

	var balance int
	err = tx.QueryRowContext(ctx, "SELECT referral_balance FROM pelanggan WHERE id = ?", id).Scan(&balance)
	if err != nil {
		if err == sql.ErrNoRows {
			return ErrCustomerNotFound
		}
		return err
	}

	if balance < amount {
		return errors.New("insufficient referral balance")
	}

	_, err = tx.ExecContext(ctx, "UPDATE pelanggan SET referral_balance = referral_balance - ?, voucher_discount = voucher_discount + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", amount, amount, id)
	if err != nil {
		return fmt.Errorf("update referral and voucher balance: %w", err)
	}

	return tx.Commit()
}
