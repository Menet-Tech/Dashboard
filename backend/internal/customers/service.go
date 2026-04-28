package customers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrCustomerNotFound = errors.New("customer not found")

type Customer struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	PackageID     int64  `json:"package_id"`
	PackageName   string `json:"package_name,omitempty"`
	PackagePrice  int    `json:"package_price,omitempty"`
	UserPPPoE     string `json:"user_pppoe"`
	PasswordPPPoE string `json:"password_pppoe"`
	WhatsApp      string `json:"whatsapp"`
	SNOnt         string `json:"sn_ont"`
	DueDay        int    `json:"due_day"`
	Status        string `json:"status"`
	Address       string `json:"address"`
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
		       c.tgl_jatuh_tempo, c.status, COALESCE(c.alamat, '')
		FROM pelanggan c
		INNER JOIN paket p ON p.id = c.paket_id
		ORDER BY c.id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list customers: %w", err)
	}
	defer rows.Close()

	items := []Customer{}
	for rows.Next() {
		var item Customer
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
		); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO pelanggan (
			nama, paket_id, user_pppoe, password_pppoe, nomor_wa, sn_ont, tgl_jatuh_tempo, status, alamat, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address)
	if err != nil {
		return Customer{}, fmt.Errorf("create customer: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Customer{}, fmt.Errorf("get customer id: %w", err)
	}

	customer.ID = id
	return customer, nil
}

func (r Repository) Update(ctx context.Context, id int64, customer Customer) (Customer, error) {
	if err := r.ensurePackageExists(ctx, customer.PackageID); err != nil {
		return Customer{}, err
	}

	result, err := r.DB.ExecContext(ctx, `
		UPDATE pelanggan
		SET nama = ?, paket_id = ?, user_pppoe = ?, password_pppoe = ?, nomor_wa = ?, sn_ont = ?, tgl_jatuh_tempo = ?, status = ?, alamat = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, customer.Name, customer.PackageID, customer.UserPPPoE, customer.PasswordPPPoE, customer.WhatsApp, customer.SNOnt, customer.DueDay, customer.Status, customer.Address, id)
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
