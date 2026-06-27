package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type PaymentConfirmation struct {
	ID            int64   `json:"id"`
	TagihanID     int64   `json:"tagihan_id"`
	PelangganID   int64   `json:"pelanggan_id"`
	CustomerName  string  `json:"customer_name"`
	InvoiceNumber string  `json:"invoice_number"`
	Amount        int     `json:"amount"`
	BuktiTransfer *string `json:"bukti_transfer,omitempty"`
	Status        string  `json:"status"`
	Catatan       string  `json:"catatan"`
	CreatedAt     string  `json:"created_at"`
}

func (s Service) CreatePaymentConfirmation(ctx context.Context, tagihanID int64, pelangganID int64, buktiTransfer *string, catatan string) (int64, error) {
	var count int
	err := s.Repository.DB.QueryRowContext(ctx, "SELECT COUNT(1) FROM payment_confirmations WHERE tagihan_id = ? AND status = 'pending_review'", tagihanID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("check existing confirmations: %w", err)
	}
	if count > 0 {
		return 0, errors.New("konfirmasi pembayaran untuk tagihan ini sedang diproses")
	}

	res, err := s.Repository.DB.ExecContext(ctx, `
		INSERT INTO payment_confirmations (tagihan_id, pelanggan_id, bukti_transfer, status, catatan, created_at, updated_at)
		VALUES (?, ?, ?, 'pending_review', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		tagihanID, pelangganID, buktiTransfer, catatan,
	)
	if err != nil {
		return 0, fmt.Errorf("insert payment confirmation: %w", err)
	}

	insertID, err := res.LastInsertId()
	if err != nil {
		return insertID, nil
	}

	// Trigger async WA and Discord alert to treasurer/admin
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		var customerName string
		var invoiceNumber string
		var nominal int

		cust, cErr := s.Customers.FindByID(bgCtx, pelangganID)
		if cErr == nil {
			customerName = cust.Name
		} else {
			customerName = fmt.Sprintf("Customer #%d", pelangganID)
		}

		billDetail, bErr := s.FindByID(bgCtx, tagihanID)
		if bErr == nil {
			invoiceNumber = billDetail.InvoiceNumber
			nominal = billDetail.Amount
		} else {
			invoiceNumber = fmt.Sprintf("Invoice #%d", tagihanID)
		}

		method := "Transfer"
		if buktiTransfer == nil || *buktiTransfer == "" {
			method = "Cash"
		}

		var msgBuilder strings.Builder
		msgBuilder.WriteString("🔔 *Konfirmasi Pembayaran Baru*\n\n")
		msgBuilder.WriteString(fmt.Sprintf("Pelanggan: %s\n", customerName))
		msgBuilder.WriteString(fmt.Sprintf("Invoice: %s\n", invoiceNumber))
		if nominal > 0 {
			msgBuilder.WriteString(fmt.Sprintf("Nominal: %s\n", formatIDRCurrency(nominal)))
		}
		msgBuilder.WriteString(fmt.Sprintf("Metode: %s\n", method))
		if catatan != "" {
			msgBuilder.WriteString(fmt.Sprintf("Catatan: %s\n", catatan))
		}
		if method == "Transfer" && buktiTransfer != nil && *buktiTransfer != "" {
			msgBuilder.WriteString(fmt.Sprintf("Bukti: %s\n", *buktiTransfer))
		}
		msgBuilder.WriteString("\nSilakan periksa di dashboard untuk melakukan konfirmasi.")

		alertMsg := msgBuilder.String()

		// Send Discord alert
		if s.Discord != nil {
			_ = s.Discord.SendAlert(bgCtx, alertMsg)
		}

		// Send WhatsApp message to admins
		adminEnv := os.Getenv("ADMIN_WA_NUMBERS")
		if adminEnv != "" && s.WhatsApp != nil {
			admins := strings.Split(adminEnv, ",")
			for _, admin := range admins {
				admin = strings.TrimSpace(admin)
				if admin != "" {
					toNum := admin
					if !strings.HasSuffix(toNum, "@c.us") {
						toNum = toNum + "@c.us"
					}
					_ = s.WhatsApp.SendDirectMessage(bgCtx, "default", toNum, alertMsg)
				}
			}
		}
	}()

	return insertID, nil
}

func (s Service) ListPendingConfirmations(ctx context.Context) ([]PaymentConfirmation, error) {
	rows, err := s.Repository.DB.QueryContext(ctx, `
		SELECT pc.id, pc.tagihan_id, pc.pelanggan_id, c.nama, t.invoice_number, t.nominal, pc.bukti_transfer, pc.status, pc.catatan, pc.created_at
		FROM payment_confirmations pc
		INNER JOIN pelanggan c ON c.id = pc.pelanggan_id
		INNER JOIN tagihan t ON t.id = pc.tagihan_id
		WHERE pc.status = 'pending_review'
		ORDER BY pc.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("list pending confirmations: %w", err)
	}
	defer rows.Close()

	var list []PaymentConfirmation
	for rows.Next() {
		var pc PaymentConfirmation
		var bukti sql.NullString
		if err := rows.Scan(&pc.ID, &pc.TagihanID, &pc.PelangganID, &pc.CustomerName, &pc.InvoiceNumber, &pc.Amount, &bukti, &pc.Status, &pc.Catatan, &pc.CreatedAt); err != nil {
			return nil, err
		}
		if bukti.Valid && bukti.String != "" {
			val := bukti.String
			pc.BuktiTransfer = &val
		}
		list = append(list, pc)
	}
	return list, nil
}

func (s Service) ApprovePaymentConfirmation(ctx context.Context, confirmationID int64, userID int64) error {
	var tagihanID int64
	var buktiTransfer sql.NullString
	err := s.Repository.DB.QueryRowContext(ctx, "SELECT tagihan_id, bukti_transfer FROM payment_confirmations WHERE id = ?", confirmationID).Scan(&tagihanID, &buktiTransfer)
	if err != nil {
		return fmt.Errorf("get confirmation: %w", err)
	}

	tx, err := s.Repository.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Update confirmation status
	_, err = tx.ExecContext(ctx, "UPDATE payment_confirmations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", confirmationID)
	if err != nil {
		return fmt.Errorf("update confirmation status: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Mark paid using existing MarkPaid method
	err = s.MarkPaid(ctx, tagihanID, "transfer_verification", userID)
	if err != nil {
		return fmt.Errorf("mark paid: %w", err)
	}

	// If there's a proof path, attach it to the bill
	if buktiTransfer.Valid && buktiTransfer.String != "" {
		_ = s.Repository.AttachProof(ctx, tagihanID, buktiTransfer.String)
	}

	return nil
}

func (s Service) RejectPaymentConfirmation(ctx context.Context, confirmationID int64) error {
	_, err := s.Repository.DB.ExecContext(ctx, "UPDATE payment_confirmations SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", confirmationID)
	if err != nil {
		return fmt.Errorf("reject confirmation: %w", err)
	}
	return nil
}

func (s Service) GetPendingConfirmationForBill(ctx context.Context, billID int64) (*PaymentConfirmation, error) {
	var pc PaymentConfirmation
	var bukti sql.NullString
	err := s.Repository.DB.QueryRowContext(ctx, `
		SELECT id, tagihan_id, pelanggan_id, status, catatan, created_at, bukti_transfer
		FROM payment_confirmations
		WHERE tagihan_id = ? AND status = 'pending_review'
		LIMIT 1`,
		billID,
	).Scan(&pc.ID, &pc.TagihanID, &pc.PelangganID, &pc.Status, &pc.Catatan, &pc.CreatedAt, &bukti)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if bukti.Valid && bukti.String != "" {
		val := bukti.String
		pc.BuktiTransfer = &val
	}
	return &pc, nil
}
