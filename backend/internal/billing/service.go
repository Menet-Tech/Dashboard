package billing

import (
	"context"
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
	ID             int64   `json:"id"`
	CustomerID     int64   `json:"customer_id"`
	CustomerName   string  `json:"customer_name"`
	CustomerPhone  string  `json:"customer_phone,omitempty"`
	PackageID      int64   `json:"package_id"`
	PackageName    string  `json:"package_name"`
	PackageSpeed   int     `json:"package_speed"`
	Period         string  `json:"period"`
	InvoiceNumber  string  `json:"invoice_number"`
	Amount         int     `json:"amount"`
	DueDate        string  `json:"due_date"`
	Status         string  `json:"status"`
	DisplayStatus  string  `json:"display_status"`
	PaidAt         *string `json:"paid_at,omitempty"`
	PaymentMethod  string  `json:"payment_method,omitempty"`
	ProofPath      *string `json:"proof_path,omitempty"`
	Diskon         int     `json:"diskon"`
	DiskonReferral int     `json:"diskon_referral"`
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

type FilterOptions struct {
	Search     string
	Status     string
	Period     string
	CustomerID int64
	Page       int
	Limit      int
}

func (s Service) List(ctx context.Context, opt FilterOptions) ([]Bill, int, error) {
	menunggakDays, err := s.getMenunggakDays(ctx)
	if err != nil {
		return nil, 0, err
	}
	return s.Repository.List(ctx, menunggakDays, time.Now(), opt)
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

	// Trigger MikroTik Sync after payment to immediately lift isolir/limit limits
	if billDetail, err := s.FindByID(ctx, billID); err == nil {
		if customer, err := s.Customers.FindByID(ctx, billDetail.CustomerID); err == nil {
			_ = s.Customers.SyncToMikrotik(ctx, customer)
		}
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
			msg := fmt.Sprintf("💰 **Pembayaran Diterima**: Tagihan **%s** sejumlah **%s** atas nama **%s** telah dilunasi via **%s**",
				detail.InvoiceNumber, formatIDRCurrency(detail.Amount), detail.CustomerName, method)

			sendErr := s.Discord.SendAlert(bgCtx, msg)

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

func (s Service) SendManualNotification(ctx context.Context, billID int64, triggerKey string) error {
	triggerKey = strings.TrimSpace(triggerKey)
	if triggerKey == "" {
		return errors.New("trigger key is required")
	}

	detail, err := s.FindByID(ctx, billID)
	if err != nil {
		return err
	}

	if s.WhatsApp == nil {
		return errors.New("whatsapp sender is not configured")
	}

	err = s.WhatsApp.SendTemplate(ctx, notifications.BillMessagePayload{
		BillID:      billID,
		TriggerKey:  triggerKey,
		PhoneNumber: detail.CustomerPhone,
		Force:       true,
		MessageData: map[string]string{
			"nama":              detail.CustomerName,
			"periode":           detail.Period,
			"jatuh_tempo":       formatDateLabel(detail.DueDate),
			"invoice_number":    detail.InvoiceNumber,
			"nominal":           formatIDRCurrency(detail.Amount),
			"status_pembayaran": detail.Status,
			"paket":             detail.PackageName,
			"kecepatan_paket":   strconv.Itoa(detail.PackageSpeed),
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send manual notification: %w", err)
	}

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

	type discordKey struct {
		BillID int64
		Event  string
	}
	discordSentThisCycle := make(map[discordKey]bool)

	for _, item := range candidates {
		dueDate, err := time.Parse("2006-01-02", item.DueDate)
		if err != nil {
			slog.Error("automation: invalid due date, skipping candidate",
				"bill_id", item.ID, "due_date", item.DueDate, "error", err)
			continue
		}
		effectiveDueDate := dueDate
		if adjustedDueDate, ok := trialGraceDueDate(item.TrialStartedAt, item.TrialDays, dueDate, options.TrialGraceDays); ok {
			effectiveDueDate = adjustedDueDate
		}

		if sameDate(dueDate, options.Now.AddDate(0, 0, options.ReminderDays)) {
			waErr := sendAutomationMessage(ctx, options, item, "reminder_custom")
			if waErr != nil {
				slog.Error("automation: send reminder WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", waErr)
			}
			key := discordKey{item.ID, "reminder"}
			if options.SendDiscord != nil && !discordSentThisCycle[key] {
				var msg string
				if waErr != nil {
					msg = fmt.Sprintf("⚠️ **Reminder Gagal (WA)**: Gagal mengirim pengingat tagihan **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
				} else {
					msg = fmt.Sprintf("⏳ **Reminder Terkirim**: Pengingat tagihan **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
				}
				_ = options.SendDiscord(ctx, msg)
				discordSentThisCycle[key] = true
			}
		}

		if sameDate(dueDate, options.Now) {
			waErr := sendAutomationMessage(ctx, options, item, "jatuh_tempo")
			if waErr != nil {
				slog.Error("automation: send jatuh_tempo WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", waErr)
			}
			key := discordKey{item.ID, "jatuh_tempo"}
			if options.SendDiscord != nil && !discordSentThisCycle[key] {
				var msg string
				if waErr != nil {
					msg = fmt.Sprintf("⚠️ **Jatuh Tempo Gagal (WA)**: Gagal mengirim notifikasi jatuh tempo tagihan **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
				} else {
					msg = fmt.Sprintf("⚠️ **Jatuh Tempo**: Notifikasi jatuh tempo tagihan **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
				}
				_ = options.SendDiscord(ctx, msg)
				discordSentThisCycle[key] = true
			}
		}

		if overdueDays(effectiveDueDate, options.Now) >= options.LimitDays {
			wasAlreadyLimited := item.CustomerStatus == "limit"

			if !wasAlreadyLimited {
				if err := s.Customers.UpdateStatus(ctx, item.CustomerID, "limit"); err != nil {
					return err
				}
			}

			if err := sendAutomationMessage(ctx, options, item, "limit_5hari"); err != nil {
				slog.Error("automation: send limit WA failed, continuing",
					"bill_id", item.ID, "customer", item.CustomerName, "error", err)
			}

			if !wasAlreadyLimited && options.SendDiscord != nil {
				msg := fmt.Sprintf("🚫 **Isolir (Limit)**: Pelanggan **%s** telah otomatis dilimit karena menunggak > %d hari.", item.CustomerName, options.LimitDays)
				_ = options.SendDiscord(ctx, msg)
			}
		}
	}

	return nil
}

func (s Service) ProcessTrialExpiry(ctx context.Context, now time.Time) error {
	if s.Customers.Repository.DB == nil {
		return nil
	}

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
	CustomerID      int64
	CustomerName    string
	CustomerPhone   string
	PackageID       int64
	PackageName     string
	PackageSpeed    int
	PackagePrice    int
	DueDay          int
	Diskon          int
	VoucherDiscount int
}

type automationCandidate struct {
	Bill
	CustomerStatus string
	TrialStartedAt *string
	TrialDays      int
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
