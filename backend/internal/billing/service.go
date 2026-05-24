package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"log/slog"

	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
)

var ErrBillNotFound = errors.New("bill not found")

type Bill struct {
	ID            int64   `json:"id"`
	CustomerID    int64   `json:"customer_id"`
	CustomerName  string  `json:"customer_name"`
	CustomerPhone string  `json:"customer_phone,omitempty"`
	PackageID     int64   `json:"package_id"`
	PackageName   string  `json:"package_name"`
	PackageSpeed  int     `json:"package_speed"`
	Period        string  `json:"period"`
	InvoiceNumber string  `json:"invoice_number"`
	Amount        int     `json:"amount"`
	DueDate       string  `json:"due_date"`
	Status        string  `json:"status"`
	DisplayStatus string  `json:"display_status"`
	PaidAt        *string `json:"paid_at,omitempty"`
	PaymentMethod string  `json:"payment_method,omitempty"`
	ProofPath     *string `json:"proof_path,omitempty"`
}

type PaymentHistory struct {
	ID        int64   `json:"id"`
	Method    string  `json:"method"`
	Amount    int     `json:"amount"`
	PaidAt    string  `json:"paid_at"`
	Note      *string `json:"note,omitempty"`
	ProofPath *string `json:"proof_path,omitempty"`
	CreatedBy *int64  `json:"created_by_user_id,omitempty"`
}

type BillDetail struct {
	Bill
	CustomerAddress string           `json:"customer_address"`
	CustomerStatus  string           `json:"customer_status"`
	PaymentHistory  []PaymentHistory `json:"payment_history"`
}

type GenerateResult struct {
	Period    string `json:"period"`
	Generated int    `json:"generated"`
}

type AutomationMessage struct {
	BillID       int64
	TriggerKey   string
	PhoneNumber  string
	TemplateData map[string]string
}

type AutomationOptions struct {
	Now            time.Time
	ReminderDays   int
	LimitDays      int
	TrialGraceDays int
	SendWhatsApp   func(context.Context, AutomationMessage) error
	SendDiscord    func(context.Context, string) error
}

type Repository struct {
	DB *sql.DB
}

type WhatsAppSender interface {
	SendTemplate(ctx context.Context, payload notifications.BillMessagePayload) error
}

type Service struct {
	Repository    Repository
	Settings      settings.Service
	Customers     customers.Service
	WhatsApp      WhatsAppSender
	Discord       notifications.DiscordSender
	Notifications notifications.NotificationLogRepository
}

func (s Service) List(ctx context.Context) ([]Bill, error) {
	menunggakDays, err := s.getMenunggakDays(ctx)
	if err != nil {
		return nil, err
	}
	return s.Repository.List(ctx, menunggakDays, time.Now())
}

func (s Service) FindByID(ctx context.Context, billID int64) (BillDetail, error) {
	menunggakDays, err := s.getMenunggakDays(ctx)
	if err != nil {
		return BillDetail{}, err
	}
	return s.Repository.FindByID(ctx, billID, menunggakDays, time.Now())
}

func (s Service) Generate(ctx context.Context, period string) (GenerateResult, error) {
	period = strings.TrimSpace(period)
	if period == "" {
		return GenerateResult{}, errors.New("period is required")
	}

	if _, err := time.Parse("2006-01", period); err != nil {
		return GenerateResult{}, errors.New("period must use YYYY-MM format")
	}

	generated, err := s.Repository.Generate(ctx, period)
	if err != nil {
		return GenerateResult{}, err
	}

	if generated > 0 && s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_generate") {
		go func() {
			alertCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = s.Discord.SendAlert(alertCtx, fmt.Sprintf("📢 **Generate Tagihan**: %d tagihan baru dibuat untuk periode **%s**", generated, period))
		}()
	}

	slog.Info("bill generation triggered", "period", period, "generated", generated)

	return GenerateResult{
		Period:    period,
		Generated: generated,
	}, nil
}

func (s Service) MarkPaid(ctx context.Context, billID int64, method string, userID int64) error {
	method = strings.TrimSpace(method)
	if method == "" {
		return errors.New("payment method is required")
	}

	err := s.Repository.MarkPaid(ctx, billID, method, userID)
	if err != nil {
		return err
	}

	if s.WhatsApp != nil {
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			detail, err := s.FindByID(bgCtx, billID)
			if err != nil {
				return
			}
			_ = s.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
				BillID:      billID,
				TriggerKey:  "lunas",
				PhoneNumber: detail.CustomerPhone,
				MessageData: map[string]string{
					"nama":              detail.CustomerName,
					"periode":           detail.Period,
					"jatuh_tempo":       formatDateLabel(detail.DueDate),
					"invoice_number":    detail.InvoiceNumber,
					"nominal":           formatIDRCurrency(detail.Amount),
					"status_pembayaran": "lunas",
					"paket":             detail.PackageName,
					"kecepatan_paket":   strconv.Itoa(detail.PackageSpeed),
				},
			})
		}()
	}

	if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_payment") {
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			detail, err := s.FindByID(bgCtx, billID)
			if err != nil {
				return
			}
			// Bug #6: use fmt.Sprintf instead of fmt.Errorf
			msg := fmt.Sprintf("💰 **Pembayaran Diterima**: Tagihan **%s** sejumlah **%s** atas nama **%s** telah dilunasi via **%s**",
				detail.InvoiceNumber, formatIDRCurrency(detail.Amount), detail.CustomerName, method)

			sendErr := s.Discord.SendAlert(bgCtx, msg)

			// Bug #20: log Discord notification to audit trail
			status := "sent"
			logMsg := ""
			if sendErr != nil {
				status = "failed"
				logMsg = sendErr.Error()
			}
			_ = s.Notifications.Record(bgCtx, billID, "payment_notification_discord", "discord", status, logMsg)
		}()
	}

	slog.Info("bill marked as paid", "bill_id", billID, "method", method, "user_id", userID)

	return nil
}

func (s Service) AttachProof(ctx context.Context, billID int64, proofPath string) error {
	if strings.TrimSpace(proofPath) == "" {
		return errors.New("proof path is required")
	}
	return s.Repository.AttachProof(ctx, billID, proofPath)
}

func (s Service) ProcessAutomation(ctx context.Context, options AutomationOptions) error {
	if options.Now.IsZero() {
		options.Now = time.Now()
	}
	if options.TrialGraceDays <= 0 {
		options.TrialGraceDays = 7
	}

	candidates, err := s.Repository.AutomationCandidates(ctx)
	if err != nil {
		return err
	}

	// discordSentThisCycle tracks which (billID, eventType) combos have already
	// had a Discord notification sent in this automation cycle, to prevent spam
	// when the worker runs every minute but the reminder/due-date date stays the same.
	type discordKey struct {
		BillID int64
		Event  string
	}
	discordSentThisCycle := make(map[discordKey]bool)

	for _, item := range candidates {
		dueDate, err := time.Parse("2006-01-02", item.DueDate)
		if err != nil {
			// Bad due-date in DB: skip this candidate, don't halt all automation.
			slog.Error("automation: invalid due date, skipping candidate",
				"bill_id", item.ID, "due_date", item.DueDate, "error", err)
			continue
		}
		effectiveDueDate := dueDate
		if adjustedDueDate, ok := trialGraceDueDate(item.TrialStartedAt, item.TrialDays, dueDate, options.TrialGraceDays); ok {
			effectiveDueDate = adjustedDueDate
		}

		// Reminder notification (N days before due date)
		if sameDate(dueDate, options.Now.AddDate(0, 0, options.ReminderDays)) {
			waErr := sendAutomationMessage(ctx, options, item, "reminder_custom")
			if waErr != nil {
				// Bug #19: log WA failure, don't skip Discord
				slog.Error("automation: send reminder WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", waErr)
			}
			// Bug #18: only send Discord once per bill per cycle
			key := discordKey{item.ID, "reminder"}
			if options.SendDiscord != nil && !discordSentThisCycle[key] {
				var msg string
				if waErr != nil {
					// Bug #19: notify Discord even when WA fails
					msg = fmt.Sprintf("⚠️ **Reminder Gagal (WA)**: Gagal mengirim pengingat tagihan **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
				} else {
					msg = fmt.Sprintf("⏳ **Reminder Terkirim**: Pengingat tagihan **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
				}
				_ = options.SendDiscord(ctx, msg)
				discordSentThisCycle[key] = true
			}
		}

		// Due-date notification
		if sameDate(dueDate, options.Now) {
			waErr := sendAutomationMessage(ctx, options, item, "jatuh_tempo")
			if waErr != nil {
				slog.Error("automation: send jatuh_tempo WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", waErr)
			}
			// Bug #18: only send Discord once per bill per cycle
			key := discordKey{item.ID, "jatuh_tempo"}
			if options.SendDiscord != nil && !discordSentThisCycle[key] {
				var msg string
				if waErr != nil {
					// Bug #19: notify Discord even when WA fails
					msg = fmt.Sprintf("⚠️ **Jatuh Tempo Gagal (WA)**: Gagal mengirim notifikasi jatuh tempo tagihan **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
				} else {
					msg = fmt.Sprintf("⚠️ **Jatuh Tempo**: Notifikasi jatuh tempo tagihan **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
				}
				_ = options.SendDiscord(ctx, msg)
				discordSentThisCycle[key] = true
			}
		}

		// Limit / isolir: only act when the customer is NOT already limited to avoid
		// spamming Discord on every worker cycle (every minute).
		if overdueDays(effectiveDueDate, options.Now) >= options.LimitDays {
			wasAlreadyLimited := item.CustomerStatus == "limit"

			if !wasAlreadyLimited {
				// Update status in DB – this IS a critical state change; return on error.
				if err := s.Repository.UpdateCustomerStatus(ctx, item.CustomerID, "limit"); err != nil {
					return err
				}
			}

			// WA: AlreadySent check inside SendTemplate prevents duplicates, so always try.
			if err := sendAutomationMessage(ctx, options, item, "limit_5hari"); err != nil {
				slog.Error("automation: send limit WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", err)
			}

			// Discord: only alert on the cycle where the customer first becomes limited.
			if !wasAlreadyLimited && options.SendDiscord != nil {
				msg := fmt.Sprintf("🚫 **Isolir (Limit)**: Pelanggan **%s** telah otomatis dilimit karena menunggak > %d hari.", item.CustomerName, options.LimitDays)
				_ = options.SendDiscord(ctx, msg)
			}
		}
	}

	return nil
}

// ProcessTrialExpiry handles trial period expiry for customers
func (s Service) ProcessTrialExpiry(ctx context.Context, now time.Time) error {
	if s.Customers.Repository.DB == nil {
		return nil
	}

	// Get all trial-expired customers
	expiredTrials, err := s.Customers.ListTrialExpired(ctx, now)
	if err != nil {
		return fmt.Errorf("list trial expired customers: %w", err)
	}

	if len(expiredTrials) == 0 {
		return nil
	}

	period := now.Format("2006-01")
	menunggakDays, err := s.getMenunggakDays(ctx)
	if err != nil {
		return err
	}
	reminderDays, err := s.getReminderDays(ctx)
	if err != nil {
		return err
	}

	for _, customer := range expiredTrials {
		bill, created, err := s.Repository.EnsureBillForCustomer(ctx, customer.ID, period, menunggakDays, now)
		if err != nil {
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendAlert(ctx, fmt.Sprintf("⚠️ **Trial Expiry Generate Failed**: Gagal generate tagihan untuk **%s** (ID:%d): %v", customer.Name, customer.ID, err))
			}
			continue
		}
		if bill.ID == 0 {
			continue
		}

		if err := s.Customers.EndTrial(ctx, customer.ID); err != nil {
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendAlert(ctx, fmt.Sprintf("⚠️ **Trial Expiry End Failed**: Gagal end trial untuk **%s** (ID:%d): %v", customer.Name, customer.ID, err))
			}
			continue
		}

		triggerKey, shouldNotify := trialExpiryTrigger(customer, bill, reminderDays)
		if s.WhatsApp != nil && shouldNotify {
			go func(cust customers.Customer, generatedBill Bill) {
				bgCtx := context.Background()
				_ = s.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
					BillID:      generatedBill.ID,
					TriggerKey:  triggerKey,
					PhoneNumber: cust.WhatsApp,
					MessageData: map[string]string{
						"nama":              cust.Name,
						"periode":           generatedBill.Period,
						"jatuh_tempo":       formatDateLabel(generatedBill.DueDate),
						"invoice_number":    generatedBill.InvoiceNumber,
						"nominal":           formatIDRCurrency(generatedBill.Amount),
						"paket":             generatedBill.PackageName,
						"kecepatan_paket":   strconv.Itoa(generatedBill.PackageSpeed),
						"status_pembayaran": "belum_bayar",
					},
				})
			}(customer, bill)
		}

		if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
			action := "mengaktifkan tagihan trial yang sudah ada"
			if created {
				action = "membuat tagihan otomatis"
			}
			_ = s.Discord.SendAlert(ctx, fmt.Sprintf("✅ **Trial Period Expired**: Pelanggan **%s** (ID:%d) trial berakhir. Sistem berhasil %s untuk periode **%s**", customer.Name, customer.ID, action, period))
		}
	}

	return nil
}

func (s Service) getMenunggakDays(ctx context.Context) (int, error) {
	if s.Settings.Repository.DB == nil {
		return 30, nil
	}
	return s.Settings.GetInt(ctx, settings.KeyMenunggakDays)
}

func (s Service) getReminderDays(ctx context.Context) (int, error) {
	if s.Settings.Repository.DB == nil {
		return 3, nil
	}
	return s.Settings.GetInt(ctx, settings.KeyReminderDays)
}

type billCandidate struct {
	CustomerID    int64
	CustomerName  string
	CustomerPhone string
	PackageID     int64
	PackageName   string
	PackageSpeed  int
	PackagePrice  int
	DueDay        int
}

type automationCandidate struct {
	Bill
	CustomerStatus string
	TrialStartedAt *string
	TrialDays      int
}

func (r Repository) List(ctx context.Context, menunggakDays int, now time.Time) ([]Bill, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT t.id, t.pelanggan_id, c.nama, COALESCE(c.nomor_wa, ''), t.paket_id, p.nama, p.kecepatan_mbps,
		       t.periode, t.invoice_number, t.nominal, t.jatuh_tempo, t.status, t.paid_at,
		       COALESCE(t.payment_method, ''), t.proof_path
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
		       COALESCE(t.payment_method, ''), t.proof_path, COALESCE(c.alamat, ''), c.status
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

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO tagihan (
				pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar', CURRENT_TIMESTAMP)
		`, candidate.CustomerID, candidate.PackageID, period, invoiceNumber, candidate.PackagePrice, dueDate.Format("2006-01-02")); err != nil {
			_ = tx.Rollback()
			return 0, fmt.Errorf("insert generated bill: %w", err)
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

	result, err := tx.ExecContext(ctx, `
		INSERT INTO tagihan (
			pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, 'belum_bayar', CURRENT_TIMESTAMP)
	`, candidate.CustomerID, candidate.PackageID, period, invoiceNumber, candidate.PackagePrice, dueDate.Format("2006-01-02"))
	if err != nil {
		_ = tx.Rollback()
		return Bill{}, false, fmt.Errorf("insert single generated bill: %w", err)
	}

	billID, err := result.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return Bill{}, false, fmt.Errorf("single generated bill id: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return Bill{}, false, fmt.Errorf("commit single generated bill: %w", err)
	}

	return Bill{
		ID:            billID,
		CustomerID:    candidate.CustomerID,
		CustomerName:  candidate.CustomerName,
		CustomerPhone: candidate.CustomerPhone,
		PackageID:     candidate.PackageID,
		PackageName:   candidate.PackageName,
		PackageSpeed:  candidate.PackageSpeed,
		Period:        period,
		InvoiceNumber: invoiceNumber,
		Amount:        candidate.PackagePrice,
		DueDate:       dueDate.Format("2006-01-02"),
		Status:        "belum_bayar",
		DisplayStatus: computeDisplayStatus("belum_bayar", dueDate.Format("2006-01-02"), menunggakDays, now),
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
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo
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
		); err != nil {
			return nil, fmt.Errorf("scan bill candidate: %w", err)
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) findCandidateForCustomer(ctx context.Context, customerID int64, period string) (billCandidate, bool, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT c.id, c.nama, COALESCE(c.nomor_wa, ''), p.id, p.nama, p.kecepatan_mbps, p.harga, c.tgl_jatuh_tempo
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
		       COALESCE(t.payment_method, ''), t.proof_path
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

func computeDisplayStatus(status string, dueDateRaw string, menunggakDays int, now time.Time) string {
	if status == "lunas" {
		return "lunas"
	}

	dueDate, err := time.Parse("2006-01-02", dueDateRaw)
	if err != nil {
		return status
	}

	if overdueDays(dueDate, now) >= menunggakDays {
		return "menunggak"
	}

	if overdueDays(dueDate, now) > 0 {
		return "jatuh_tempo"
	}

	return "belum_bayar"
}

func resolveDueDate(period time.Time, dueDay int) time.Time {
	year, month, _ := period.Date()
	location := period.Location()
	firstOfMonth := time.Date(year, month, 1, 0, 0, 0, 0, location)
	lastOfMonth := firstOfMonth.AddDate(0, 1, -1)
	day := dueDay
	if dueDay > lastOfMonth.Day() {
		day = lastOfMonth.Day()
	}

	return time.Date(year, month, day, 0, 0, 0, 0, location)
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

func overdueDays(dueDate, now time.Time) int {
	d := dateOnly(now).Sub(dateOnly(dueDate))
	return int(d.Hours() / 24)
}

func sameDate(a, b time.Time) bool {
	return dateOnly(a).Equal(dateOnly(b))
}

func dateOnly(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
}

func sendAutomationMessage(ctx context.Context, options AutomationOptions, item automationCandidate, triggerKey string) error {
	if options.SendWhatsApp == nil {
		return nil
	}

	return options.SendWhatsApp(ctx, AutomationMessage{
		BillID:      item.ID,
		TriggerKey:  triggerKey,
		PhoneNumber: item.CustomerPhone,
		TemplateData: map[string]string{
			"nama":              item.CustomerName,
			"periode":           item.Period,
			"jatuh_tempo":       formatDateLabel(item.DueDate),
			"invoice_number":    item.InvoiceNumber,
			"nominal":           formatIDRCurrency(item.Amount),
			"status_pembayaran": item.Status,
			"hari_limit":        strconv.Itoa(options.LimitDays),
			"paket":             item.PackageName,
			"kecepatan_paket":   strconv.Itoa(item.PackageSpeed),
		},
	})
}

func trialExpiryTrigger(customer customers.Customer, bill Bill, reminderDays int) (string, bool) {
	trialEndedAt, ok := resolveTrialEndedAt(customer.TrialStartedAt, customer.TrialDays)
	if !ok {
		return "trial_expired", true
	}
	dueDate, err := time.Parse("2006-01-02", bill.DueDate)
	if err != nil {
		return "trial_expired", true
	}
	reminderDate := dateOnly(dueDate).AddDate(0, 0, -reminderDays)
	if trialEndedAt.Before(reminderDate) {
		return "", false
	}
	if dateOnly(trialEndedAt).Before(dateOnly(dueDate)) {
		return "reminder_custom", true
	}
	return "jatuh_tempo", true
}

func resolveTrialEndedAt(trialStartedAt *string, trialDays int) (time.Time, bool) {
	if trialStartedAt == nil || strings.TrimSpace(*trialStartedAt) == "" || trialDays <= 0 {
		return time.Time{}, false
	}
	startedAt, err := time.Parse(time.RFC3339, *trialStartedAt)
	if err != nil {
		return time.Time{}, false
	}
	return startedAt.AddDate(0, 0, trialDays), true
}

func trialGraceDueDate(trialStartedAt *string, trialDays int, dueDate time.Time, graceDays int) (time.Time, bool) {
	trialEndedAt, ok := resolveTrialEndedAt(trialStartedAt, trialDays)
	if !ok {
		return time.Time{}, false
	}
	if !trialEndedAt.After(dueDate) {
		return time.Time{}, false
	}
	if graceDays <= 0 {
		graceDays = 7
	}
	return dateOnly(trialEndedAt).AddDate(0, 0, graceDays), true
}

func formatDateLabel(raw string) string {
	value, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return raw
	}
	return value.Format("02-01-2006")
}

func formatIDRCurrency(amount int) string {
	value := strconv.Itoa(amount)
	if len(value) <= 3 {
		return "Rp " + value
	}

	parts := []byte{}
	offset := len(value) % 3
	if offset > 0 {
		parts = append(parts, value[:offset]...)
		if len(value) > offset {
			parts = append(parts, '.')
		}
	}

	for i := offset; i < len(value); i += 3 {
		parts = append(parts, value[i:i+3]...)
		if i+3 < len(value) {
			parts = append(parts, '.')
		}
	}

	return "Rp " + string(parts)
}
