package billing

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
	"log/slog"

	"menettech/dashboard/backend/internal/customers"
	"menettech/dashboard/backend/internal/notifications"
	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
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
	GroupBillIDs []int64
	TriggerKey   string
	PhoneNumber  string
	TemplateData map[string]string
	CustomBody   string
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
	SendDirectMessage(ctx context.Context, accountID, toNumber, body string) error
}

type Service struct {
	Repository    Repository
	Settings      settings.Service
	Customers     customers.Service
	WhatsApp      WhatsAppSender
	Discord       notifications.DiscordSender
	Notifications notifications.NotificationLogRepository
	Templates     templates.Service
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
			_ = s.Discord.SendEmbed(alertCtx, notifications.DiscordEmbed{
				Title:       "📢 Tagihan Bulanan Baru Dibuat",
				Description: fmt.Sprintf("Sistem berhasil men-generate tagihan baru untuk periode **%s**.", period),
				Color:       3447003, // Blue (#3498db)
				Fields: []notifications.EmbedField{
					{
						Name:   "Jumlah Pelanggan",
						Value:  fmt.Sprintf("%d Pelanggan", generated),
						Inline: true,
					},
					{
						Name:   "Periode Layanan",
						Value:  period,
						Inline: true,
					},
				},
			})
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

	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		detail, err := s.FindByID(bgCtx, billID)
		if err != nil {
			return
		}
		templateData := map[string]string{
			"nama":              detail.CustomerName,
			"periode":           detail.Period,
			"jatuh_tempo":       formatDateLabel(detail.DueDate),
			"invoice_number":    detail.InvoiceNumber,
			"nominal":           formatIDRCurrency(detail.Amount),
			"status_pembayaran": "lunas",
			"paket":             detail.PackageName,
			"kecepatan_paket":   strconv.Itoa(detail.PackageSpeed),
		}
		if s.WhatsApp != nil {
			_ = s.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
				BillID:      billID,
				TriggerKey:  "lunas",
				PhoneNumber: detail.CustomerPhone,
				MessageData: templateData,
			})
		}
		s.QueueEmailForTrigger(bgCtx, billID, "lunas", templateData)
	}()

	if s.Discord != nil {
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			detail, err := s.FindByID(bgCtx, billID)
			if err != nil {
				return
			}
			
			var adminUser string = "Sistem"
			if userID > 0 {
				_ = s.Repository.DB.QueryRowContext(bgCtx, "SELECT username FROM users WHERE id = ?", userID).Scan(&adminUser)
			}
			
			embed := notifications.DiscordEmbed{
				Title:       "💰 Pembayaran Tagihan Diterima",
				Description: fmt.Sprintf("Tagihan milik pelanggan **%s** telah lunas.", detail.CustomerName),
				Color:       3066993, // Green (#2ecc71)
				Fields: []notifications.EmbedField{
					{
						Name:   "Pelanggan",
						Value:  detail.CustomerName,
						Inline: true,
					},
					{
						Name:   "Nomor Invoice",
						Value:  detail.InvoiceNumber,
						Inline: true,
					},
					{
						Name:   "Jumlah Nominal",
						Value:  formatIDRCurrency(detail.Amount),
						Inline: true,
					},
					{
						Name:   "Metode Pembayaran",
						Value:  method,
						Inline: true,
					},
					{
						Name:   "Periode Tagihan",
						Value:  detail.Period,
						Inline: true,
					},
					{
						Name:   "Tanggal Jatuh Tempo",
						Value:  detail.DueDate,
						Inline: true,
					},
					{
						Name:   "Diproses Oleh",
						Value:  adminUser,
						Inline: true,
					},
				},
			}
			sendErr := s.Discord.SendEmbed(bgCtx, embed)

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

	templateData := map[string]string{
		"nama":              detail.CustomerName,
		"periode":           detail.Period,
		"jatuh_tempo":       formatDateLabel(detail.DueDate),
		"invoice_number":    detail.InvoiceNumber,
		"nominal":           formatIDRCurrency(detail.Amount),
		"status_pembayaran": detail.Status,
		"paket":             detail.PackageName,
		"kecepatan_paket":   strconv.Itoa(detail.PackageSpeed),
	}

	if s.WhatsApp != nil {
		_ = s.WhatsApp.SendTemplate(ctx, notifications.BillMessagePayload{
			BillID:      billID,
			TriggerKey:  triggerKey,
			PhoneNumber: detail.CustomerPhone,
			Force:       true,
			MessageData: templateData,
		})
	}

	s.QueueEmailForTrigger(ctx, billID, triggerKey, templateData)

	return nil
}

func (s Service) QueueEmailForTrigger(ctx context.Context, billID int64, triggerKey string, templateData map[string]string) {
	if s.Repository.DB == nil {
		return
	}
	var email string
	err := s.Repository.DB.QueryRowContext(ctx, `
		SELECT COALESCE(c.email, '')
		FROM tagihan t
		INNER JOIN pelanggan c ON c.id = t.pelanggan_id
		WHERE t.id = ?
	`, billID).Scan(&email)
	email = strings.TrimSpace(email)
	if err != nil || email == "" {
		return
	}

	subject := ""
	body := ""

	// Try loading custom template
	customTpl, err := s.Templates.FindActiveEmailTemplateByTrigger(ctx, triggerKey)
	if err == nil && customTpl.IsActive {
		subject = templates.Render(customTpl.Subject, templateData)
		body = templates.Render(customTpl.Content, templateData)
	} else {
		// Fallback to hardcoded defaults
		switch triggerKey {
		case "tagihan-h7":
			subject = fmt.Sprintf("Tagihan Internet Baru - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Ini adalah pemberitahuan tagihan internet Anda periode %s dengan nomor invoice %s sebesar %s yang akan jatuh tempo pada tanggal %s.\n\n"+
				"Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["periode"], templateData["invoice_number"], templateData["nominal"], templateData["jatuh_tempo"])
		case "reminder-h3":
			subject = fmt.Sprintf("Pengingat Tagihan Internet - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Ini adalah pengingat bahwa tagihan internet Anda periode %s dengan nomor invoice %s sebesar %s akan jatuh tempo dalam 3 hari (%s).\n\n"+
				"Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["periode"], templateData["invoice_number"], templateData["nominal"], templateData["jatuh_tempo"])
		case "isolir_20hari":
			subject = fmt.Sprintf("Pemberitahuan Layanan Dinonaktifkan - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Layanan internet Anda untuk nomor invoice %s periode %s telah dinonaktifkan sepenuhnya karena pembayaran melewati 15 hari sejak masa pembatasan (limit).\n\n"+
				"Silakan lakukan pembayaran dan hubungi admin untuk mengaktifkan kembali layanan Anda.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["invoice_number"], templateData["periode"])
		case "reminder-h5":
			subject = fmt.Sprintf("Pengingat Tagihan Internet %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Ini adalah pengingat bahwa tagihan internet Anda periode %s dengan nomor invoice %s sebesar %s akan jatuh tempo pada tanggal %s.\n\n"+
				"Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["periode"], templateData["invoice_number"], templateData["nominal"], templateData["jatuh_tempo"])
		case "jatuh_tempo":
			subject = fmt.Sprintf("Tagihan Internet Jatuh Hari Ini - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Hari ini adalah tanggal jatuh tempo pembayaran internet Anda periode %s dengan nomor invoice %s sebesar %s.\n\n"+
				"Mohon segera melakukan pembayaran agar layanan Anda tidak terputus.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["periode"], templateData["invoice_number"], templateData["nominal"])
		case "limit_5hari":
			subject = fmt.Sprintf("Pemberitahuan Layanan Terisolir - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Layanan internet Anda untuk nomor invoice %s periode %s telah diisolir sementara karena pembayaran melewati batas jatuh tempo (menunggak %s hari).\n\n"+
				"Layanan akan otomatis aktif kembali setelah pembayaran dikonfirmasi.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["invoice_number"], templateData["periode"], templateData["hari_limit"])
		case "lunas":
			subject = fmt.Sprintf("Pembayaran Berhasil - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Terima kasih, pembayaran Anda untuk invoice %s periode %s sebesar %s telah kami terima dan berstatus Lunas.\n\n"+
				"Terima kasih telah menggunakan layanan kami.\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["invoice_number"], templateData["periode"], templateData["nominal"])
		default:
			subject = fmt.Sprintf("Notifikasi Tagihan Internet - %s", templateData["invoice_number"])
			body = fmt.Sprintf("Yth. %s,\n\n"+
				"Ini adalah notifikasi mengenai tagihan internet Anda:\n"+
				"- No. Invoice: %s\n"+
				"- Paket: %s (%s Mbps)\n"+
				"- Periode: %s\n"+
				"- Nominal: %s\n"+
				"- Jatuh Tempo: %s\n\n"+
				"Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pembatasan layanan (isolir).\n\n"+
				"Terima kasih,\nLayanan Billing",
				templateData["nama"], templateData["invoice_number"], templateData["paket"], templateData["kecepatan_paket"], templateData["periode"], templateData["nominal"], templateData["jatuh_tempo"])
		}
	}

	_, err = s.Repository.DB.ExecContext(ctx, `
		INSERT INTO email_queue (to_email, subject, body, status, attempts)
		VALUES (?, ?, ?, 'pending', 0)
	`, email, subject, body)
	if err != nil {
		slog.Error("failed to queue email notification", "trigger", triggerKey, "error", err)
	} else {
		slog.Info("queued email notification", "trigger", triggerKey, "to", email)
	}
}

func (s Service) AttachProof(ctx context.Context, billID int64, proofPath string) error {
	if strings.TrimSpace(proofPath) == "" {
		return errors.New("proof path is required")
	}
	return s.Repository.AttachProof(ctx, billID, proofPath)
}

// GrantExtension marks an active bill as "pending extension" and sets the
// customer status to "pending". On next billing generation, this causes the
// previous unpaid bill to be written off as "perpanjangan" and the new bill
// to carry double the nominal (current + carried-over month).
func (s Service) GrantExtension(ctx context.Context, billID int64) error {
	detail, err := s.FindByID(ctx, billID)
	if err != nil {
		return err
	}
	if detail.Status == "lunas" {
		return errors.New("bill sudah lunas, tidak bisa diperpanjang")
	}
	// Set customer to pending so next Generate picks it up as perpanjangan
	if err := s.Customers.UpdateStatus(ctx, detail.CustomerID, "pending"); err != nil {
		return fmt.Errorf("grant extension: update customer status: %w", err)
	}
	slog.Info("extension granted", "bill_id", billID, "customer_id", detail.CustomerID)
	return nil
}

func (s Service) ProcessAutomation(ctx context.Context, options AutomationOptions) error {
	if options.Now.IsZero() {
		options.Now = time.Now()
	}
	if options.TrialGraceDays <= 0 {
		options.TrialGraceDays = 7
	}

	suspendedDays, err := s.Settings.GetInt(ctx, settings.KeyInactiveSuspendedDays)
	if err != nil {
		suspendedDays = 30
	}

	candidates, err := s.Repository.AutomationCandidates(ctx)
	if err != nil {
		return err
	}

	// 1. Group candidates by phone number
	phoneGroups := make(map[string][]automationCandidate)
	var emptyPhoneCandidates []automationCandidate
	for _, item := range candidates {
		phone := strings.TrimSpace(item.CustomerPhone)
		if phone == "" {
			emptyPhoneCandidates = append(emptyPhoneCandidates, item)
			continue
		}
		phoneGroups[phone] = append(phoneGroups[phone], item)
	}

	// Sort candidates in each group by CustomerID ascending (first registered first)
	for phone, group := range phoneGroups {
		sort.Slice(group, func(i, j int) bool {
			return group[i].CustomerID < group[j].CustomerID
		})
		phoneGroups[phone] = group
	}

	discordSentThisCycle := make(map[string]bool)

	// Process billing notifications (tagihan-h7, reminder-h3, and jatuh_tempo) per phone number group
	for phone, group := range phoneGroups {
		// 1. Process tagihan-h7 (7 days before due date)
		var tagihanH7Unsent []automationCandidate
		for _, item := range group {
			dueDate, err := time.Parse("2006-01-02", item.DueDate)
			if err != nil {
				continue
			}
			if sameDate(dueDate, options.Now.AddDate(0, 0, 7)) {
				// Skip if pending review or perpanjangan (pending customer status)
				if item.HasPendingConfirmation || item.CustomerStatus == "pending" {
					continue
				}
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "tagihan-h7")
				if err == nil && !sent {
					tagihanH7Unsent = append(tagihanH7Unsent, item)
				}
			}
		}

		if len(tagihanH7Unsent) > 0 {
			if err := s.sendGroupedNotifications(ctx, options, phone, tagihanH7Unsent, "tagihan-h7", discordSentThisCycle); err != nil {
				slog.Error("automation: send tagihan-h7 failed", "phone", phone, "error", err)
			}
		}

		// 2. Process reminder-h3 (3 days before due date)
		var reminderH3Unsent []automationCandidate
		for _, item := range group {
			dueDate, err := time.Parse("2006-01-02", item.DueDate)
			if err != nil {
				continue
			}
			if sameDate(dueDate, options.Now.AddDate(0, 0, 3)) {
				// Skip if pending review or perpanjangan (pending customer status)
				if item.HasPendingConfirmation || item.CustomerStatus == "pending" {
					continue
				}
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "reminder-h3")
				if err == nil && !sent {
					reminderH3Unsent = append(reminderH3Unsent, item)
				}
			}
		}

		if len(reminderH3Unsent) > 0 {
			if err := s.sendGroupedNotifications(ctx, options, phone, reminderH3Unsent, "reminder-h3", discordSentThisCycle); err != nil {
				slog.Error("automation: send reminder-h3 failed", "phone", phone, "error", err)
			}
		}

		// 3. Process jatuh_tempo (due date today)
		var jatuhTempoUnsent []automationCandidate
		for _, item := range group {
			dueDate, err := time.Parse("2006-01-02", item.DueDate)
			if err != nil {
				continue
			}
			if sameDate(dueDate, options.Now) {
				// Skip if pending review or perpanjangan (pending customer status)
				if item.HasPendingConfirmation || item.CustomerStatus == "pending" {
					continue
				}
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "jatuh_tempo")
				if err == nil && !sent {
					jatuhTempoUnsent = append(jatuhTempoUnsent, item)
				}
			}
		}

		if len(jatuhTempoUnsent) > 0 {
			if err := s.sendGroupedNotifications(ctx, options, phone, jatuhTempoUnsent, "jatuh_tempo", discordSentThisCycle); err != nil {
				slog.Error("automation: send jatuh_tempo failed", "phone", phone, "error", err)
			}
		}
	}

	// Process empty phone candidates individually
	for _, item := range emptyPhoneCandidates {
		dueDate, err := time.Parse("2006-01-02", item.DueDate)
		if err != nil {
			continue
		}

		// tagihan-h7
		if sameDate(dueDate, options.Now.AddDate(0, 0, 7)) {
			if !item.HasPendingConfirmation && item.CustomerStatus != "pending" {
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "tagihan-h7")
				if err == nil && !sent {
					waErr := sendAutomationMessage(ctx, options, item, "tagihan-h7")
					key := fmt.Sprintf("%d-tagihan-h7", item.ID)
					if options.SendDiscord != nil && !discordSentThisCycle[key] {
						var msg string
						if waErr != nil {
							msg = fmt.Sprintf("⚠️ **Tagihan H-7 Gagal (WA)**: Gagal mengirim tagihan **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
						} else {
							msg = fmt.Sprintf("⏳ **Tagihan H-7 Terkirim**: Tagihan **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
						}
						_ = options.SendDiscord(ctx, msg)
						discordSentThisCycle[key] = true
					}
				}
			}
		}

		// reminder-h3
		if sameDate(dueDate, options.Now.AddDate(0, 0, 3)) {
			if !item.HasPendingConfirmation && item.CustomerStatus != "pending" {
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "reminder-h3")
				if err == nil && !sent {
					waErr := sendAutomationMessage(ctx, options, item, "reminder-h3")
					key := fmt.Sprintf("%d-reminder-h3", item.ID)
					if options.SendDiscord != nil && !discordSentThisCycle[key] {
						var msg string
						if waErr != nil {
							msg = fmt.Sprintf("⚠️ **Reminder H-3 Gagal (WA)**: Gagal mengirim pengingat **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
						} else {
							msg = fmt.Sprintf("⏳ **Reminder H-3 Terkirim**: Pengingat **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
						}
						_ = options.SendDiscord(ctx, msg)
						discordSentThisCycle[key] = true
					}
				}
			}
		}

		// jatuh_tempo
		if sameDate(dueDate, options.Now) {
			if !item.HasPendingConfirmation && item.CustomerStatus != "pending" {
				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "jatuh_tempo")
				if err == nil && !sent {
					waErr := sendAutomationMessage(ctx, options, item, "jatuh_tempo")
					key := fmt.Sprintf("%d-jatuh_tempo", item.ID)
					if options.SendDiscord != nil && !discordSentThisCycle[key] {
						var msg string
						if waErr != nil {
							msg = fmt.Sprintf("⚠️ **Jatuh Tempo Gagal (WA)**: Gagal mengirim notifikasi jatuh tempo **%s** ke **%s**: %v", item.InvoiceNumber, item.CustomerName, waErr)
						} else {
							msg = fmt.Sprintf("⚠️ **Jatuh Tempo**: Notifikasi jatuh tempo **%s** telah dikirim ke **%s**", item.InvoiceNumber, item.CustomerName)
						}
						_ = options.SendDiscord(ctx, msg)
						discordSentThisCycle[key] = true
					}
				}
			}
		}
	}

	// 2. Process isolir/limit and complete isolir (inactive) triggers individually for all candidates
	for _, item := range candidates {
		dueDate, err := time.Parse("2006-01-02", item.DueDate)
		if err != nil {
			continue
		}
		effectiveDueDate := dueDate
		if adjustedDueDate, ok := trialGraceDueDate(item.TrialStartedAt, item.TrialDays, dueDate, options.TrialGraceDays); ok {
			effectiveDueDate = adjustedDueDate
		}

		// Bypass isolir check if customer status is "pending" (perpanjangan)
		if item.CustomerStatus != "pending" {
			od := overdueDays(effectiveDueDate, options.Now)

			// Phase 3: complete deactivation (inactive) -> options.LimitDays + 15 + suspendedDays
			if od >= options.LimitDays+15+suspendedDays {
				wasAlreadyInactive := item.CustomerStatus == "inactive"

				if !wasAlreadyInactive {
					if err := s.Customers.UpdateStatus(ctx, item.CustomerID, "inactive"); err != nil {
						return err
					}
				}

				if !wasAlreadyInactive && options.SendDiscord != nil {
					msg := fmt.Sprintf("🚫 **Layanan Dinonaktifkan (Inactive)**: Pelanggan **%s** telah dinonaktifkan sepenuhnya (secret disabled) karena menunggak > %d hari.", item.CustomerName, options.LimitDays+15+suspendedDays)
					_ = options.SendDiscord(ctx, msg)
				}

			// Phase 2: suspension -> options.LimitDays + 15
			} else if od >= options.LimitDays+15 {
				wasAlreadySuspended := item.CustomerStatus == "suspended" || item.CustomerStatus == "inactive"

				if !wasAlreadySuspended {
					if err := s.Customers.UpdateStatus(ctx, item.CustomerID, "suspended"); err != nil {
						return err
					}
				}

				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "isolir_20hari")
				if err == nil && !sent {
					if err := sendAutomationMessage(ctx, options, item, "isolir_20hari"); err != nil {
						slog.Error("automation: send isolir_20hari WA failed, continuing",
							"bill_id", item.ID, "customer", item.CustomerName, "error", err)
					}
				}

				if !wasAlreadySuspended && options.SendDiscord != nil {
					msg := fmt.Sprintf("🚫 **Layanan Ditangguhkan (Suspended)**: Pelanggan **%s** telah ditangguhkan karena menunggak > %d hari.", item.CustomerName, options.LimitDays+15)
					_ = options.SendDiscord(ctx, msg)
				}

			} else if od >= options.LimitDays {
				// H+5: limit stage
				wasAlreadyLimited := item.CustomerStatus == "limit" || item.CustomerStatus == "suspended" || item.CustomerStatus == "inactive"

				if !wasAlreadyLimited {
					if err := s.Customers.UpdateStatus(ctx, item.CustomerID, "limit"); err != nil {
						return err
					}
				}

				sent, err := s.Notifications.AlreadySent(ctx, item.ID, "limit_5hari")
				if err == nil && !sent {
					if err := sendAutomationMessage(ctx, options, item, "limit_5hari"); err != nil {
						slog.Error("automation: send limit WA failed, continuing",
							"bill_id", item.ID, "customer", item.CustomerName, "error", err)
					}
				}

				if !wasAlreadyLimited && options.SendDiscord != nil {
					msg := fmt.Sprintf("🚫 **Isolir (Limit)**: Pelanggan **%s** telah otomatis dilimit karena menunggak > %d hari.", item.CustomerName, options.LimitDays)
					_ = options.SendDiscord(ctx, msg)
				}
			}
		}
	}

	return nil
}

func (s Service) sendGroupedNotifications(ctx context.Context, options AutomationOptions, phone string, unsent []automationCandidate, triggerKey string, discordSentThisCycle map[string]bool) error {
	if len(unsent) == 0 {
		return nil
	}

	if len(unsent) == 1 {
		waErr := sendAutomationMessage(ctx, options, unsent[0], triggerKey)
		if waErr != nil {
			slog.Error("automation: send WA failed", "trigger", triggerKey, "bill_id", unsent[0].ID, "customer", unsent[0].CustomerName, "error", waErr)
		}
		key := fmt.Sprintf("%d-%s", unsent[0].ID, triggerKey)
		if options.SendDiscord != nil && !discordSentThisCycle[key] {
			var msg string
			if waErr != nil {
				msg = fmt.Sprintf("⚠️ **%s Gagal (WA)**: Gagal mengirim %s tagihan **%s** ke **%s**: %v", triggerKey, triggerKey, unsent[0].InvoiceNumber, unsent[0].CustomerName, waErr)
			} else {
				msg = fmt.Sprintf("⏳ **%s Terkirim**: %s tagihan **%s** telah dikirim ke **%s**", triggerKey, triggerKey, unsent[0].InvoiceNumber, unsent[0].CustomerName)
			}
			_ = options.SendDiscord(ctx, msg)
			discordSentThisCycle[key] = true
		}
		return waErr
	}

	// Combined message
	var totalAmount int
	var detailBlock strings.Builder
	var billIDs []int64

	for i, c := range unsent {
		totalAmount += c.Amount
		pkgPrice := c.Amount + c.Diskon + c.DiskonReferral
		
		if i > 0 {
			detailBlock.WriteString("\n")
		}
		detailBlock.WriteString(fmt.Sprintf("> Nama Pengguna: %s\n", c.CustomerName))
		detailBlock.WriteString(fmt.Sprintf("> Paket: %s\n", c.PackageName))
		detailBlock.WriteString(fmt.Sprintf("> Harga: Rp %s.", formatThousandSeparator(pkgPrice)))
		
		totalDisc := c.Diskon + c.DiskonReferral
		if totalDisc > 0 {
			detailBlock.WriteString("\n")
			if c.HasODP {
				percent := (totalDisc * 100) / pkgPrice
				detailBlock.WriteString(fmt.Sprintf("> Diskon: %d%%", percent))
			} else {
				detailBlock.WriteString(fmt.Sprintf("> Diskon: Rp %s.", formatThousandSeparator(totalDisc)))
			}
		}
		billIDs = append(billIDs, c.ID)
	}

	primaryName, err := s.Repository.GetPrimaryCustomerNameByPhone(ctx, phone)
	if err != nil || primaryName == "" {
		primaryName = unsent[0].CustomerName
	}

	var sb strings.Builder
	sb.WriteString("Pelanggan Yth,\n")
	sb.WriteString(fmt.Sprintf("Bapak/Ibu %s,\n\n", primaryName))

	switch triggerKey {
	case "tagihan-h7":
		sb.WriteString(fmt.Sprintf("Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", unsent[0].Period, formatThousandSeparator(totalAmount)))
	case "reminder-h3", "reminder-h5":
		sb.WriteString(fmt.Sprintf("Pengingat: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", unsent[0].Period, formatThousandSeparator(totalAmount)))
	case "jatuh_tempo":
		sb.WriteString(fmt.Sprintf("PEMBERITAHUAN JATUH TEMPO: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", unsent[0].Period, formatThousandSeparator(totalAmount)))
	default:
		sb.WriteString(fmt.Sprintf("Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", unsent[0].Period, formatThousandSeparator(totalAmount)))
	}

	sb.WriteString(detailBlock.String())
	sb.WriteString("\n\n")
	sb.WriteString(fmt.Sprintf("Total Tagihan: Rp %s.\n\n", formatThousandSeparator(totalAmount)))

	switch triggerKey {
	case "jatuh_tempo":
		sb.WriteString(fmt.Sprintf("Mohon segera lakukan pembayaran hari ini (%s) agar terhindar dari Pembatasan Layanan.\n\n", formatDateLabel(unsent[0].DueDate)))
	default:
		sb.WriteString(fmt.Sprintf("Mohon lakukan pembayaran sebelum tanggal %s agar terhindar dari Pembatasan Layanan.\n\n", formatDateLabel(unsent[0].DueDate)))
	}

	sb.WriteString("jika sudah melakukan pembayaran, kamu dapat memberikan bukti transfer ke sini atau balas dengan \"ya saya sudah payar\" jika kamu membayar dengan cash\n\n")

	sb.WriteString("Rekening Pembayaran:\n")
	sb.WriteString("Bank Mandiri\n1570006636691\n\n")
	sb.WriteString("Shopeepay, gopay\n089621743796\n\n")
	sb.WriteString("Seabank\n901096534584 \n\n")
	sb.WriteString("a.n. Irfan Dharmawan \n\n")

	sb.WriteString("Untuk konfirmasi pembayaran & Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.\n")
	sb.WriteString("087782297657 - Menet CS\n")
	sb.WriteString("08987700897 - Elam\n")
	sb.WriteString("089621743796 - Ipong\n\n")

	sb.WriteString("Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n")
	sb.WriteString("Hormat kami,\n")
	sb.WriteString("Tim Billing — MeNet Tech")

	waErr := options.SendWhatsApp(ctx, AutomationMessage{
		BillID:       unsent[0].ID,
		GroupBillIDs: billIDs,
		TriggerKey:   triggerKey,
		PhoneNumber:  phone,
		CustomBody:   sb.String(),
	})

	key := fmt.Sprintf("%d-%s", unsent[0].ID, triggerKey)
	if options.SendDiscord != nil && !discordSentThisCycle[key] {
		var msg string
		if waErr != nil {
			msg = fmt.Sprintf("⚠️ **Combined %s Gagal (WA)**: Gagal mengirim tagihan gabungan ke %s (%s): %v", triggerKey, unsent[0].CustomerName, phone, waErr)
		} else {
			msg = fmt.Sprintf("⏳ **Combined %s Terkirim**: Tagihan gabungan telah dikirim ke %s (%s)", triggerKey, unsent[0].CustomerName, phone)
		}
		_ = options.SendDiscord(ctx, msg)
		discordSentThisCycle[key] = true
	}

	return waErr
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
				_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "⚠️ Gagal Membuat Tagihan Pasca-Trial",
					Description: fmt.Sprintf("Gagal memproses tagihan baru untuk pelanggan **%s**.", customer.Name),
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Nama Pelanggan", Value: customer.Name, Inline: true},
						{Name: "ID Pelanggan", Value: strconv.FormatInt(customer.ID, 10), Inline: true},
						{Name: "Error", Value: err.Error(), Inline: false},
					},
				})
			}
			continue
		}
		if bill.ID == 0 {
			continue
		}

		if err := s.Customers.EndTrial(ctx, customer.ID); err != nil {
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_worker") {
				_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "⚠️ Gagal Menyelesaikan Masa Trial",
					Description: fmt.Sprintf("Gagal mengubah status trial pelanggan **%s** menjadi selesai.", customer.Name),
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Nama Pelanggan", Value: customer.Name, Inline: true},
						{Name: "ID Pelanggan", Value: strconv.FormatInt(customer.ID, 10), Inline: true},
						{Name: "Error", Value: err.Error(), Inline: false},
					},
				})
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
				action = "membuat tagihan otomatis baru"
			}
			_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
				Title:       "✅ Masa Trial Berakhir",
				Description: fmt.Sprintf("Masa trial pelanggan **%s** telah selesai.", customer.Name),
				Color:       3066993, // Green (#2ecc71)
				Fields: []notifications.EmbedField{
					{Name: "Pelanggan", Value: customer.Name, Inline: true},
					{Name: "ID Pelanggan", Value: strconv.FormatInt(customer.ID, 10), Inline: true},
					{Name: "Tindakan Sistem", Value: action, Inline: false},
					{Name: "Periode Tagihan", Value: period, Inline: true},
				},
			})
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
	TipeDiskon      string
	VoucherDiscount int
	CustomerStatus  string
	IsTrial         bool
	TrialStartedAt  string
	TrialDays       int
}


type automationCandidate struct {
	Bill
	CustomerStatus         string
	TrialStartedAt         *string
	TrialDays              int
	HasODP                 bool
	HasPendingConfirmation bool
}

func computeDisplayStatus(status string, dueDateRaw string, menunggakDays int, now time.Time) string {
	if status == "lunas" {
		return "lunas"
	}
	if status == "pending_paid" {
		return "pending_lunas"
	}
	if status == "pending_extension" {
		return "pending_perpanjangan"
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

	pkgPrice := item.Amount + item.Diskon + item.DiskonReferral
	totalDisc := item.Diskon + item.DiskonReferral
	diskonVal := ""
	if totalDisc > 0 {
		if item.HasODP {
			percent := (totalDisc * 100) / pkgPrice
			diskonVal = fmt.Sprintf("Diskon: %d%%", percent)
		} else {
			diskonVal = fmt.Sprintf("Diskon: %s.", formatIDRCurrency(totalDisc))
		}
	}

	return options.SendWhatsApp(ctx, AutomationMessage{
		BillID:      item.ID,
		TriggerKey:  triggerKey,
		PhoneNumber: item.CustomerPhone,
		TemplateData: map[string]string{
			"nama":              item.CustomerName,
			"periode":           item.Period,
			"jatuh_tempo":       formatDateLabel(item.DueDate),
			"tgl_jatuh_tempo":   formatDateLabel(item.DueDate),
			"invoice_number":    item.InvoiceNumber,
			"nominal":           formatIDRCurrency(item.Amount),
			"harga_paket":       formatIDRCurrency(pkgPrice),
			"diskon":            diskonVal,
			"status_pembayaran": item.Status,
			"hari_limit":        strconv.Itoa(options.LimitDays),
			"paket":             item.PackageName,
			"kecepatan_paket":   strconv.Itoa(item.PackageSpeed),
		},
	})
}

func trialExpiryTrigger(_ customers.Customer, _ Bill, _ int) (string, bool) {
	return "trial_expired", true
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

func (s Service) PrepareMarkPaid(ctx context.Context, billID int64, method string, userID int64) error {
	return s.Repository.PrepareMarkPaid(ctx, billID, method, userID)
}

func (s Service) PrepareExtension(ctx context.Context, billID int64) error {
	return s.Repository.PrepareExtension(ctx, billID)
}

func (s Service) CancelPendingAction(ctx context.Context, billID int64) error {
	return s.Repository.CancelPendingAction(ctx, billID)
}

func (s Service) CommitExtension(ctx context.Context, billID int64) error {
	detail, err := s.FindByID(ctx, billID)
	if err != nil {
		return err
	}

	// 1. Revert bill status to belum_bayar from pending_extension
	if err := s.Repository.SetBillStatus(ctx, billID, "belum_bayar"); err != nil {
		return err
	}

	// 2. Set customer status to pending (so next generation picks it up)
	if err := s.Customers.UpdateStatus(ctx, detail.CustomerID, "pending"); err != nil {
		return fmt.Errorf("commit extension: update customer status: %w", err)
	}

	slog.Info("extension committed", "bill_id", billID, "customer_id", detail.CustomerID)

	// 3. Send WhatsApp and Email notification
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		detail, err := s.FindByID(bgCtx, billID)
		if err != nil {
			return
		}
		templateData := map[string]string{
			"nama":           detail.CustomerName,
			"periode":        detail.Period,
			"jatuh_tempo":    formatDateLabel(detail.DueDate),
			"nominal":        formatIDRCurrency(detail.Amount),
			"harga":          formatIDRCurrency(detail.Amount),
			"invoice_number": detail.InvoiceNumber,
			"paket":          detail.PackageName,
		}
		if s.WhatsApp != nil {
			_ = s.WhatsApp.SendTemplate(bgCtx, notifications.BillMessagePayload{
				BillID:      billID,
				TriggerKey:  "perpanjangan",
				PhoneNumber: detail.CustomerPhone,
				MessageData: templateData,
			})
		}
		s.QueueEmailForTrigger(bgCtx, billID, "perpanjangan", templateData)
	}()

	return nil
}

func (s Service) ProcessDelayedActions(ctx context.Context) error {
	list, err := s.Repository.ListDelayedActions(ctx)
	if err != nil {
		return err
	}

	for _, b := range list {
		// SQLite CURRENT_TIMESTAMP is in UTC. Format is "2006-01-02 15:04:05"
		updatedAt, err := time.ParseInLocation("2006-01-02 15:04:05", b.UpdatedAt, time.UTC)
		if err != nil {
			slog.Error("failed to parse delayed bill updated_at time", "bill_id", b.ID, "updated_at", b.UpdatedAt, "error", err)
			continue
		}

		if time.Now().UTC().Sub(updatedAt) >= 10*time.Minute {
			slog.Info("processing delayed billing action", "bill_id", b.ID, "status", b.Status)
			if b.Status == "pending_paid" {
				// Revert status to belum_bayar first so that s.MarkPaid check is clean
				if err := s.Repository.SetBillStatus(ctx, b.ID, "belum_bayar"); err != nil {
					slog.Error("failed to revert bill status to check mark paid", "bill_id", b.ID, "error", err)
					continue
				}
				if err := s.MarkPaid(ctx, b.ID, b.PaymentMethod, b.PaidByUserID); err != nil {
					slog.Error("failed to execute delayed mark paid", "bill_id", b.ID, "error", err)
				}
			} else if b.Status == "pending_extension" {
				if err := s.CommitExtension(ctx, b.ID); err != nil {
					slog.Error("failed to execute delayed extension", "bill_id", b.ID, "error", err)
				}
			}
		}
	}

	return nil
}

func formatThousandSeparator(amount int) string {
	value := strconv.Itoa(amount)
	if len(value) <= 3 {
		return value
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

	return string(parts)
}
