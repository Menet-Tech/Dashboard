package notifications

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/settings"
	"menettech/dashboard/backend/internal/templates"
)

type NotificationLogRepository struct {
	DB *sql.DB
}

type WhatsAppService struct {
	Settings   settings.Service
	Templates  templates.Service
	Logs       NotificationLogRepository
	HTTPClient *http.Client
	Discord    *DiscordService
}

type BillMessagePayload struct {
	BillID      int64
	TriggerKey  string
	PhoneNumber string
	MessageData map[string]string
	Force       bool
}

type QueuedMessage struct {
	ID           int64
	AccountID    string
	ToNumber     string
	Body         string
	Status       string
	Attempts     int
	BillID       sql.NullInt64
	TriggerKey   sql.NullString
	GroupBillIDs sql.NullString
	IsManual     bool
}

func (s WhatsAppService) SendTemplate(ctx context.Context, payload BillMessagePayload) error {
	if strings.TrimSpace(payload.PhoneNumber) == "" {
		return nil
	}

	if !payload.Force {
		sent, err := s.Logs.AlreadySent(ctx, payload.BillID, payload.TriggerKey)
		if err != nil {
			return err
		}
		if sent {
			return nil
		}
	}

	tpl, err := s.Templates.FindActiveByTrigger(ctx, payload.TriggerKey)
	if err != nil {
		return err
	}

	accountID, err := s.accountIDForTrigger(ctx, payload.TriggerKey)
	if err != nil {
		return err
	}
	trimmedAccountID := strings.TrimSpace(accountID)
	if envValue := strings.TrimSpace(os.Getenv("WA_ACCOUNT_ID")); envValue != "" && (trimmedAccountID == "" || trimmedAccountID == "default") {
		accountID = envValue
	}
	if strings.TrimSpace(accountID) == "" {
		accountID = os.Getenv("WA_ACCOUNT_ID")
	}
	if strings.TrimSpace(accountID) == "" {
		accountID = "default"
	}

	var renderedText string

	// If the admin has customized the template, use it directly.
	// Otherwise fall back to the hardcoded billing builder.
	if tpl.IsCustom {
		renderedText = templates.Render(tpl.Content, payload.MessageData)
	} else {
		switch payload.TriggerKey {
		case "lunas":
			var period string
			_ = s.Logs.DB.QueryRowContext(ctx, "SELECT periode FROM tagihan WHERE id = ?", payload.BillID).Scan(&period)
			if period != "" {
				var primaryName string
				_ = s.Logs.DB.QueryRowContext(ctx, `
				SELECT nama FROM pelanggan
				WHERE nomor_wa = ?
				ORDER BY id ASC
				LIMIT 1
			`, payload.PhoneNumber).Scan(&primaryName)
				if primaryName == "" {
					primaryName = payload.MessageData["nama"]
				}

				type BillInfo struct {
					Period      string
					Nominal     float64
					CustName    string
					PackageName string
					HargaPaket  float64
					Diskon      float64
					DiscRef     float64
					HasODP      bool
				}
				var bills []BillInfo
				rows, err := s.Logs.DB.QueryContext(ctx, `
				SELECT t.periode, t.nominal, p.nama, COALESCE(pk.nama, ''), COALESCE(pk.harga, 0), t.diskon, t.diskon_referral, COALESCE(p.odp_id, 0)
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				LEFT JOIN paket pk ON p.paket_id = pk.id
				WHERE p.nomor_wa = ? AND t.status = 'lunas' AND t.periode = ?
				ORDER BY t.id ASC
			`, payload.PhoneNumber, period)
				if err == nil {
					for rows.Next() {
						var b BillInfo
						var odpID int64
						if err := rows.Scan(&b.Period, &b.Nominal, &b.CustName, &b.PackageName, &b.HargaPaket, &b.Diskon, &b.DiscRef, &odpID); err == nil {
							b.HasODP = odpID > 0
							bills = append(bills, b)
						}
					}
					if err := rows.Err(); err != nil {
						slog.Error("error iterating lunas bills", "error", err)
					}
					rows.Close()
				}

				if len(bills) == 0 {
					var b BillInfo
					var odpID int64
					err := s.Logs.DB.QueryRowContext(ctx, `
					SELECT t.periode, t.nominal, p.nama, COALESCE(pk.nama, ''), COALESCE(pk.harga, 0), t.diskon, t.diskon_referral, COALESCE(p.odp_id, 0)
					FROM tagihan t
					JOIN pelanggan p ON t.pelanggan_id = p.id
					LEFT JOIN paket pk ON p.paket_id = pk.id
					WHERE t.id = ?
				`, payload.BillID).Scan(&b.Period, &b.Nominal, &b.CustName, &b.PackageName, &b.HargaPaket, &b.Diskon, &b.DiscRef, &odpID)
					if err == nil {
						b.HasODP = odpID > 0
						bills = append(bills, b)
					}
				}

				if len(bills) >= 1 {
					var totalAmount int
					var detailBlock strings.Builder
					for i, b := range bills {
						totalAmount += int(b.Nominal)
						pkgPrice := int(b.HargaPaket)
						if pkgPrice == 0 {
							pkgPrice = int(b.Nominal) + int(b.Diskon) + int(b.DiscRef)
						}

						if i > 0 {
							detailBlock.WriteString("\n")
						}
						detailBlock.WriteString(fmt.Sprintf("> Nama Pengguna: %s\n", b.CustName))
						detailBlock.WriteString(fmt.Sprintf("> Paket: %s\n", b.PackageName))
						detailBlock.WriteString(fmt.Sprintf("> Harga: Rp %s.", formatThousandSeparator(pkgPrice)))

						totalDisc := int(b.Diskon + b.DiscRef)
						if totalDisc > 0 {
							detailBlock.WriteString("\n")
							if b.HasODP {
								percent := (totalDisc * 100) / pkgPrice
								detailBlock.WriteString(fmt.Sprintf("> Diskon: %d%%", percent))
							} else {
								detailBlock.WriteString(fmt.Sprintf("> Diskon: Rp %s.", formatThousandSeparator(totalDisc)))
							}
						}
					}

					var builder strings.Builder
					builder.WriteString("Pelanggan Yth,\n")
					builder.WriteString(fmt.Sprintf("Bapak/Ibu %s,\n\n", primaryName))
					builder.WriteString(fmt.Sprintf("Terimakasih Atas pembayaran Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", period, formatThousandSeparator(totalAmount)))
					builder.WriteString(detailBlock.String())
					builder.WriteString("\n\n")
					builder.WriteString(fmt.Sprintf("Total Pembayaran: Rp %s.\n\n", formatThousandSeparator(totalAmount)))
					builder.WriteString("Pembayaran Anda telah kami terima dan verifikasi. Layanan internet Anda aktif normal.\n\n")
					builder.WriteString("Untuk konfirmasi pembayaran & Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.\n")
					builder.WriteString("087782297657 - Menet CS\n")
					builder.WriteString("08987700897 - Elam\n")
					builder.WriteString("089621743796 - Ipong\n\n")
					builder.WriteString("Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n")
					builder.WriteString("Hormat kami,\n")
					builder.WriteString("Tim Billing — MeNet Tech")
					renderedText = builder.String()
				}
			}

		case "tagihan-h7", "reminder-h3", "reminder-h5", "jatuh_tempo", "limit_5hari", "isolir_20hari", "trial_expired":
			var targetPeriod string
			var targetDueDate string
			_ = s.Logs.DB.QueryRowContext(ctx, "SELECT periode, jatuh_tempo FROM tagihan WHERE id = ?", payload.BillID).Scan(&targetPeriod, &targetDueDate)

			var unpaidBills []struct {
				ID            int64
				Period        string
				Nominal       float64
				CustName      string
				PackageName   string
				HargaPaket    float64
				Diskon        float64
				DiscRef       float64
				HasODP        bool
				DueDate       string
				PaymentMethod string
			}

			var rows *sql.Rows
			var err error
			if targetPeriod != "" {
				rows, err = s.Logs.DB.QueryContext(ctx, `
				SELECT t.id, t.periode, t.nominal, p.nama, COALESCE(pk.nama, ''), COALESCE(pk.harga, 0), t.diskon, t.diskon_referral, COALESCE(p.odp_id, 0), t.jatuh_tempo, COALESCE(t.payment_method, '')
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				LEFT JOIN paket pk ON p.paket_id = pk.id
				WHERE p.nomor_wa = ?
				  AND (t.status = 'belum_bayar' OR (t.payment_method = 'perpanjangan' AND EXISTS (
				      SELECT 1 FROM tagihan t2
				      WHERE t2.pelanggan_id = t.pelanggan_id AND t2.status = 'belum_bayar'
				  )))
				  AND p.status NOT IN ('inactive', 'perpanjangan', 'wifi_umum')
				  AND t.periode <= ?
				ORDER BY t.periode ASC, t.id ASC
			`, payload.PhoneNumber, targetPeriod)
			} else {
				rows, err = s.Logs.DB.QueryContext(ctx, `
				SELECT t.id, t.periode, t.nominal, p.nama, COALESCE(pk.nama, ''), COALESCE(pk.harga, 0), t.diskon, t.diskon_referral, COALESCE(p.odp_id, 0), t.jatuh_tempo, COALESCE(t.payment_method, '')
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				LEFT JOIN paket pk ON p.paket_id = pk.id
				WHERE p.nomor_wa = ?
				  AND (t.status = 'belum_bayar' OR (t.payment_method = 'perpanjangan' AND EXISTS (
				      SELECT 1 FROM tagihan t2
				      WHERE t2.pelanggan_id = t.pelanggan_id AND t2.status = 'belum_bayar'
				  )))
				  AND p.status NOT IN ('inactive', 'perpanjangan', 'wifi_umum')
				ORDER BY t.periode ASC, t.id ASC
			`, payload.PhoneNumber)
			}

			if err == nil {
				for rows.Next() {
					var b struct {
						ID            int64
						Period        string
						Nominal       float64
						CustName      string
						PackageName   string
						HargaPaket    float64
						Diskon        float64
						DiscRef       float64
						HasODP        bool
						DueDate       string
						PaymentMethod string
					}
					var odpID int64
					if err := rows.Scan(&b.ID, &b.Period, &b.Nominal, &b.CustName, &b.PackageName, &b.HargaPaket, &b.Diskon, &b.DiscRef, &odpID, &b.DueDate, &b.PaymentMethod); err == nil {
						b.HasODP = odpID > 0
						unpaidBills = append(unpaidBills, b)
					}
				}
				if err := rows.Err(); err != nil {
					slog.Error("error iterating unpaid bills", "error", err)
				}
				rows.Close()
			}

			if len(unpaidBills) == 0 {
				var b struct {
					ID            int64
					Period        string
					Nominal       float64
					CustName      string
					PackageName   string
					HargaPaket    float64
					Diskon        float64
					DiscRef       float64
					HasODP        bool
					DueDate       string
					PaymentMethod string
				}
				var odpID int64
				err := s.Logs.DB.QueryRowContext(ctx, `
				SELECT t.id, t.periode, t.nominal, p.nama, COALESCE(pk.nama, ''), COALESCE(pk.harga, 0), t.diskon, t.diskon_referral, COALESCE(p.odp_id, 0), t.jatuh_tempo, COALESCE(t.payment_method, '')
				FROM tagihan t
				JOIN pelanggan p ON t.pelanggan_id = p.id
				LEFT JOIN paket pk ON p.paket_id = pk.id
				WHERE t.id = ? AND p.status NOT IN ('inactive', 'perpanjangan', 'wifi_umum')
			`, payload.BillID).Scan(&b.ID, &b.Period, &b.Nominal, &b.CustName, &b.PackageName, &b.HargaPaket, &b.Diskon, &b.DiscRef, &odpID, &b.DueDate, &b.PaymentMethod)
				if err == nil {
					b.HasODP = odpID > 0
					unpaidBills = append(unpaidBills, b)
					if targetDueDate == "" {
						targetDueDate = b.DueDate
					}
				}
			}

			// If we have perpanjangan bills, adjust the carryover bill's nominal
			var perpanjanganTotal float64
			for _, b := range unpaidBills {
				if b.PaymentMethod == "perpanjangan" {
					perpanjanganTotal += b.Nominal
				}
			}
			if perpanjanganTotal > 0 {
				for i, b := range unpaidBills {
					if b.PaymentMethod != "perpanjangan" {
						unpaidBills[i].Nominal = b.Nominal - perpanjanganTotal
						if unpaidBills[i].Nominal < 0 {
							unpaidBills[i].Nominal = 0
						}
					}
				}
			}

			if len(unpaidBills) >= 1 {
				var primaryName string
				_ = s.Logs.DB.QueryRowContext(ctx, `
				SELECT nama FROM pelanggan
				WHERE nomor_wa = ?
				ORDER BY id ASC
				LIMIT 1
			`, payload.PhoneNumber).Scan(&primaryName)
				if primaryName == "" {
					primaryName = unpaidBills[0].CustName
				}

				// Group bills by periode
				type periodGroup struct {
					Period  string
					DueDate string
					Total   int
					Items   []struct {
						CustName    string
						PackageName string
						PkgPrice    int
						TotalDisc   int
						HasODP      bool
					}
				}
				var groups []periodGroup
				groupIdx := make(map[string]int)
				for _, b := range unpaidBills {
					pkgPrice := int(b.HargaPaket)
					if pkgPrice == 0 {
						pkgPrice = int(b.Nominal) + int(b.Diskon) + int(b.DiscRef)
					}
					totalDisc := int(b.Diskon + b.DiscRef)
					item := struct {
						CustName    string
						PackageName string
						PkgPrice    int
						TotalDisc   int
						HasODP      bool
					}{b.CustName, b.PackageName, pkgPrice, totalDisc, b.HasODP}

					if idx, ok := groupIdx[b.Period]; ok {
						groups[idx].Total += int(b.Nominal)
						groups[idx].Items = append(groups[idx].Items, item)
					} else {
						groupIdx[b.Period] = len(groups)
						groups = append(groups, periodGroup{
							Period:  b.Period,
							DueDate: b.DueDate,
							Total:   int(b.Nominal),
							Items: []struct {
								CustName    string
								PackageName string
								PkgPrice    int
								TotalDisc   int
								HasODP      bool
							}{item},
						})
					}
				}

				var totalAmount int
				for _, g := range groups {
					totalAmount += g.Total
				}

				var detailBlock strings.Builder
				multiPeriod := len(groups) > 1
				for gi, g := range groups {
					if multiPeriod {
						if gi > 0 {
							detailBlock.WriteString("\n")
						}
						detailBlock.WriteString(fmt.Sprintf("📅 Periode %s:\n", g.Period))
					}
					for _, item := range g.Items {
						detailBlock.WriteString(fmt.Sprintf("> Nama Pengguna: %s\n", item.CustName))
						detailBlock.WriteString(fmt.Sprintf("> Paket: %s\n", item.PackageName))
						detailBlock.WriteString(fmt.Sprintf("> Harga: Rp %s.", formatThousandSeparator(item.PkgPrice)))
						if item.TotalDisc > 0 {
							detailBlock.WriteString("\n")
							if item.HasODP {
								percent := (item.TotalDisc * 100) / item.PkgPrice
								detailBlock.WriteString(fmt.Sprintf("> Diskon: %d%%", percent))
							} else {
								detailBlock.WriteString(fmt.Sprintf("> Diskon: Rp %s.", formatThousandSeparator(item.TotalDisc)))
							}
						}
						detailBlock.WriteString("\n\n")
					}
				}
				// Trim the trailing newline added by the last item
				detail := strings.TrimRight(detailBlock.String(), "\n")

				var builder strings.Builder
				builder.WriteString("Pelanggan Yth,\n")
				builder.WriteString(fmt.Sprintf("Bapak/Ibu %s,\n\n", primaryName))

				period := groups[0].Period
				dueDateFormatted := formatDateLabel(targetDueDate)
				if dueDateFormatted == "" && len(groups) > 0 {
					dueDateFormatted = formatDateLabel(groups[len(groups)-1].DueDate)
				}
				// When multiple periods, show a generic "tagihan tertunggak" in the header
				periodLabel := period
				if multiPeriod {
					periodLabel = "tertunggak"
				}

				switch payload.TriggerKey {
				case "tagihan-h7":
					builder.WriteString(fmt.Sprintf("Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				case "reminder-h3", "reminder-h5":
					builder.WriteString(fmt.Sprintf("Pengingat: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				case "jatuh_tempo":
					builder.WriteString(fmt.Sprintf("PEMBERITAHUAN JATUH TEMPO: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				case "limit_5hari":
					builder.WriteString(fmt.Sprintf("PEMBERITAHUAN PEMBATASAN LAYANAN: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				case "isolir_20hari":
					builder.WriteString(fmt.Sprintf("PEMBERITAHUAN PENANGGUHAN LAYANAN: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				case "trial_expired":
					builder.WriteString(fmt.Sprintf("PEMBERITAHUAN MASA TRIAL BERAKHIR: Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				default:
					builder.WriteString(fmt.Sprintf("Tagihan Anda periode %s sebesar Rp %s., dengan detail berikut\n\n", periodLabel, formatThousandSeparator(totalAmount)))
				}

				builder.WriteString(detail)
				builder.WriteString("\n\n")
				builder.WriteString(fmt.Sprintf("Total Tagihan: Rp %s.\n\n", formatThousandSeparator(totalAmount)))

				switch payload.TriggerKey {
				case "jatuh_tempo":
					builder.WriteString(fmt.Sprintf("Mohon segera lakukan pembayaran hari ini (%s) agar terhindar dari Pembatasan Layanan.\n\n", dueDateFormatted))
				case "limit_5hari":
					builder.WriteString("Layanan Anda saat ini dibatasi. Mohon segera lakukan pembayaran agar layanan kembali normal.\n\n")
				case "isolir_20hari":
					builder.WriteString("Layanan Anda saat ini ditangguhkan. Mohon segera lakukan pembayaran agar dapat terhubung kembali.\n\n")
				default:
					builder.WriteString(fmt.Sprintf("Mohon lakukan pembayaran sebelum tanggal %s agar terhindar dari Pembatasan Layanan.\n\n", dueDateFormatted))
				}

				builder.WriteString("jika sudah melakukan pembayaran, kamu dapat memberikan bukti transfer ke sini atau balas dengan \"ya saya sudah payar\" jika kamu membayar dengan cash\n\n")

				builder.WriteString("Rekening Pembayaran:\n")
				builder.WriteString("Bank Mandiri\n1570006636691\n\n")
				builder.WriteString("Shopeepay, gopay\n089621743796\n\n")
				builder.WriteString("Seabank\n901096534584 \n\n")
				builder.WriteString("a.n. Irfan Dharmawan \n\n")

				builder.WriteString("Untuk konfirmasi pembayaran & Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.\n")
				builder.WriteString("087782297657 - Menet CS\n")
				builder.WriteString("08987700897 - Elam\n")
				builder.WriteString("089621743796 - Ipong\n\n")

				builder.WriteString("Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n")
				builder.WriteString("Hormat kami,\n")
				builder.WriteString("Tim Billing — MeNet Tech")

				renderedText = builder.String()
			}
		} // end switch inside else
	} // end else (hardcoded builder)

	if renderedText == "" {
		renderedText = templates.Render(tpl.Content, payload.MessageData)
	}

	return s.QueueMessage(ctx, accountID, payload.PhoneNumber, renderedText, payload.BillID, payload.TriggerKey, payload.Force)
}

func (s WhatsAppService) QueueDirectMessage(ctx context.Context, accountID, toNumber, body string) error {
	return s.QueueMessage(ctx, accountID, toNumber, body, 0, "", false)
}

func (s WhatsAppService) QueueGroupedMessage(ctx context.Context, accountID, toNumber, body string, billIDs []int64, triggerKey string) error {
	if len(billIDs) == 0 {
		return s.QueueDirectMessage(ctx, accountID, toNumber, body)
	}

	billID := billIDs[0]
	var bID sql.NullInt64
	if billID > 0 {
		bID = sql.NullInt64{Int64: billID, Valid: true}
	}
	var tKey sql.NullString
	if triggerKey != "" {
		tKey = sql.NullString{String: triggerKey, Valid: true}
	}

	if billID > 0 && strings.TrimSpace(triggerKey) != "" {
		var existingID int64
		err := s.Logs.DB.QueryRowContext(ctx, `
			SELECT id
			FROM whatsapp_queue
			WHERE bill_id = ?
			  AND trigger_key = ?
			  AND to_number = ?
			  AND status IN ('pending', 'processing', 'sent', 'failed')
			ORDER BY id DESC
			LIMIT 1
		`, billID, triggerKey, toNumber).Scan(&existingID)
		if err == nil {
			slog.Info("queue: duplicate grouped whatsapp automation skipped", "existing_id", existingID, "bill_id", billID, "trigger", triggerKey, "to", toNumber)
			return nil
		}
		if err != sql.ErrNoRows {
			return fmt.Errorf("check existing grouped whatsapp_queue: %w", err)
		}
	}

	groupJSON, err := json.Marshal(billIDs)
	if err != nil {
		return fmt.Errorf("marshal grouped bill ids: %w", err)
	}

	_, err = s.Logs.DB.ExecContext(ctx, `
		INSERT INTO whatsapp_queue (account_id, to_number, body, status, attempts, bill_id, trigger_key, group_bill_ids, is_manual)
		VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, 0)
	`, accountID, toNumber, body, bID, tKey, string(groupJSON))
	if err != nil {
		return fmt.Errorf("insert grouped whatsapp_queue: %w", err)
	}
	return nil
}

func (s WhatsAppService) SendDirectMessage(ctx context.Context, accountID, toNumber, body string) error {
	return s.sendDirect(ctx, QueuedMessage{
		AccountID: accountID,
		ToNumber:  toNumber,
		Body:      body,
		IsManual:  true,
	})
}

func (s WhatsAppService) QueueMessage(ctx context.Context, accountID, toNumber, body string, billID int64, triggerKey string, isManual bool) error {
	var bID sql.NullInt64
	if billID > 0 {
		bID = sql.NullInt64{Int64: billID, Valid: true}
	}
	var tKey sql.NullString
	if triggerKey != "" {
		tKey = sql.NullString{String: triggerKey, Valid: true}
	}

	manualVal := 0
	if isManual {
		manualVal = 1
	}

	if !isManual && billID > 0 && strings.TrimSpace(triggerKey) != "" {
		var existingID int64
		err := s.Logs.DB.QueryRowContext(ctx, `
			SELECT id
			FROM whatsapp_queue
			WHERE bill_id = ?
			  AND trigger_key = ?
			  AND to_number = ?
			  AND status IN ('pending', 'processing', 'sent', 'failed')
			ORDER BY id DESC
			LIMIT 1
		`, billID, triggerKey, toNumber).Scan(&existingID)
		if err == nil {
			slog.Info("queue: duplicate whatsapp automation skipped", "existing_id", existingID, "bill_id", billID, "trigger", triggerKey, "to", toNumber)
			return nil
		}
		if err != sql.ErrNoRows {
			return fmt.Errorf("check existing whatsapp_queue: %w", err)
		}
	}

	_, err := s.Logs.DB.ExecContext(ctx, `
		INSERT INTO whatsapp_queue (account_id, to_number, body, status, attempts, bill_id, trigger_key, is_manual)
		VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
	`, accountID, toNumber, body, bID, tKey, manualVal)
	if err != nil {
		return fmt.Errorf("insert into whatsapp_queue: %w", err)
	}
	return nil
}

func (s WhatsAppService) ProcessQueue(ctx context.Context) (bool, bool, error) {
	tx, err := s.Logs.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, false, err
	}
	defer tx.Rollback()

	row := tx.QueryRowContext(ctx, `
		SELECT id, account_id, to_number, body, status, attempts, bill_id, trigger_key, COALESCE(group_bill_ids, ''), is_manual
		FROM whatsapp_queue
		WHERE status = 'pending' AND attempts < 3
		ORDER BY is_manual DESC, id ASC
		LIMIT 1
	`)

	var msg QueuedMessage
	var isManualVal int
	err = row.Scan(&msg.ID, &msg.AccountID, &msg.ToNumber, &msg.Body, &msg.Status, &msg.Attempts, &msg.BillID, &msg.TriggerKey, &msg.GroupBillIDs, &isManualVal)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, false, nil
		}
		return false, false, fmt.Errorf("query pending message: %w", err)
	}
	msg.IsManual = isManualVal == 1

	if !msg.IsManual && msg.BillID.Valid && msg.TriggerKey.Valid {
		var existingID int64
		err := tx.QueryRowContext(ctx, `
			SELECT id
			FROM whatsapp_queue
			WHERE id < ?
			  AND bill_id = ?
			  AND trigger_key = ?
			  AND to_number = ?
			  AND status IN ('pending', 'processing', 'sent', 'failed')
			ORDER BY id ASC
			LIMIT 1
		`, msg.ID, msg.BillID.Int64, msg.TriggerKey.String, msg.ToNumber).Scan(&existingID)
		if err == nil {
			_, updateErr := tx.ExecContext(ctx, `
				UPDATE whatsapp_queue
				SET status = 'failed', error_message = ?
				WHERE id = ?
			`, fmt.Sprintf("duplicate automation queue skipped; existing queue id %d", existingID), msg.ID)
			if updateErr != nil {
				slog.Error("failed to mark duplicate whatsapp queue as skipped", "id", msg.ID, "existing_id", existingID, "error", updateErr)
			}
			if commitErr := tx.Commit(); commitErr != nil {
				return false, false, fmt.Errorf("commit duplicate mark: %w", commitErr)
			}
			slog.Info("queue: duplicate whatsapp automation skipped before send", "id", msg.ID, "existing_id", existingID, "bill_id", msg.BillID.Int64, "trigger", msg.TriggerKey.String, "to", msg.ToNumber)
			return true, msg.IsManual, nil
		}
		if err != sql.ErrNoRows {
			return false, false, fmt.Errorf("check prior whatsapp_queue duplicate: %w", err)
		}
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE whatsapp_queue
		SET status = 'processing', attempts = attempts + 1
		WHERE id = ?
	`, msg.ID)
	if err != nil {
		return false, false, fmt.Errorf("lock queue row: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return false, false, fmt.Errorf("commit lock: %w", err)
	}
	msg.Attempts++

	sendErr := s.sendDirect(ctx, msg)

	now := time.Now().UTC().Format(time.RFC3339)
	if sendErr == nil {
		_, err = s.Logs.DB.ExecContext(ctx, `
			UPDATE whatsapp_queue
			SET status = 'sent', sent_at = ?
			WHERE id = ?
		`, now, msg.ID)
		if err != nil {
			slog.Error("failed to mark message as sent", "id", msg.ID, "error", err)
		}

		notificationBillIDs := msg.NotificationBillIDs()
		if len(notificationBillIDs) > 0 && msg.TriggerKey.Valid {
			for _, billID := range notificationBillIDs {
				recordErr := s.Logs.RecordWithMessage(ctx, billID, msg.TriggerKey.String, msg.ToNumber, "sent", "OK", msg.Body)
				if recordErr != nil {
					slog.Error("failed to record notification log", "bill_id", billID, "trigger", msg.TriggerKey.String, "error", recordErr)
				}
			}
			if s.Discord != nil {
				typeStr := "Otomatis"
				if msg.IsManual {
					typeStr = "Manual"
				}
				_ = s.Discord.SendEmbed(ctx, DiscordEmbed{
					Title:     "📤 Notifikasi WhatsApp Terkirim",
					Color:     3066993, // Green
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Fields: []EmbedField{
						{Name: "Tipe", Value: typeStr, Inline: true},
						{Name: "Trigger", Value: msg.TriggerKey.String, Inline: true},
						{Name: "Penerima", Value: msg.ToNumber, Inline: true},
						{Name: "Pesan", Value: "```\n" + truncateString(msg.Body, 500) + "\n```", Inline: false},
					},
					Footer: &EmbedFooter{Text: "Menet-Tech WA Gateway"},
				})
			}
		}
		slog.Info("queue: whatsapp message sent", "id", msg.ID, "to", msg.ToNumber)
		return true, msg.IsManual, nil
	}

	errMsg := sendErr.Error()
	status := "pending"
	if msg.Attempts >= 3 {
		status = "failed"
	}

	_, err = s.Logs.DB.ExecContext(ctx, `
		UPDATE whatsapp_queue
		SET status = ?, error_message = ?
		WHERE id = ?
	`, status, errMsg, msg.ID)
	if err != nil {
		slog.Error("failed to update failed message status", "id", msg.ID, "error", err)
	}

	notificationBillIDs := msg.NotificationBillIDs()
	if status == "failed" && len(notificationBillIDs) > 0 && msg.TriggerKey.Valid {
		for _, billID := range notificationBillIDs {
			_ = s.Logs.RecordWithMessage(ctx, billID, msg.TriggerKey.String, msg.ToNumber, "failed", errMsg, msg.Body)
		}
		if s.Discord != nil {
			typeStr := "Otomatis"
			if msg.IsManual {
				typeStr = "Manual"
			}
			_ = s.Discord.SendEmbed(ctx, DiscordEmbed{
				Title:     "❌ Gagal Kirim Notifikasi WhatsApp",
				Color:     15158332, // Red
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Fields: []EmbedField{
					{Name: "Tipe", Value: typeStr, Inline: true},
					{Name: "Trigger", Value: msg.TriggerKey.String, Inline: true},
					{Name: "Penerima", Value: msg.ToNumber, Inline: true},
					{Name: "Error", Value: errMsg, Inline: false},
					{Name: "Pesan", Value: "```\n" + truncateString(msg.Body, 300) + "\n```", Inline: false},
				},
				Footer: &EmbedFooter{Text: "Menet-Tech WA Gateway"},
			})
		}
	}

	return true, msg.IsManual, nil
}

func (msg QueuedMessage) NotificationBillIDs() []int64 {
	if msg.GroupBillIDs.Valid && strings.TrimSpace(msg.GroupBillIDs.String) != "" {
		var billIDs []int64
		if err := json.Unmarshal([]byte(msg.GroupBillIDs.String), &billIDs); err == nil {
			seen := make(map[int64]bool, len(billIDs))
			filtered := make([]int64, 0, len(billIDs))
			for _, billID := range billIDs {
				if billID <= 0 || seen[billID] {
					continue
				}
				seen[billID] = true
				filtered = append(filtered, billID)
			}
			if len(filtered) > 0 {
				return filtered
			}
		}
	}

	if msg.BillID.Valid && msg.BillID.Int64 > 0 {
		return []int64{msg.BillID.Int64}
	}
	return nil
}

func (s WhatsAppService) sendDirect(ctx context.Context, msg QueuedMessage) error {
	url, err := s.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	if err != nil {
		return err
	}
	url = settings.ResolveWAGatewayURL(url)

	apiKey, err := s.Settings.GetString(ctx, settings.KeyWAAPIKey)
	if err != nil {
		return err
	}
	if strings.TrimSpace(apiKey) == "" {
		apiKey = os.Getenv("DASHBOARD_INTERNAL_API_KEY")
	}
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("WA API Key is not configured")
	}

	timeoutSecs, _ := s.Settings.GetInt(ctx, "wa_client_timeout_seconds")
	if timeoutSecs <= 0 {
		timeoutSecs = 60
	}

	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: time.Duration(timeoutSecs) * time.Second}
	} else if client.Timeout == 0 {
		client.Timeout = time.Duration(timeoutSecs) * time.Second
	}

	body, err := json.Marshal(map[string]any{
		"to":        msg.ToNumber,
		"text":      msg.Body,
		"is_manual": msg.IsManual,
	})
	if err != nil {
		return fmt.Errorf("marshal whatsapp payload: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(url, "/")+"/api/v1/messages", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create whatsapp request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-API-Key", apiKey)
	if strings.TrimSpace(msg.AccountID) != "" {
		request.Header.Set("X-Account-Id", msg.AccountID)
	}
	// Idempotency key: queue row ID.
	// If the gateway receives the same key across retries, it knows it's the exact same queue item and can
	// skip re-sending while returning 200 OK or cached response.
	if msg.ID > 0 {
		request.Header.Set("X-Idempotency-Key", fmt.Sprintf("queue-%d", msg.ID))
	}

	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("send whatsapp message HTTP: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return fmt.Errorf("whatsapp gateway returned status %d", response.StatusCode)
	}

	return nil
}

func (s WhatsAppService) accountIDForTrigger(ctx context.Context, triggerKey string) (string, error) {
	settingKey := settings.KeyWAAccountID
	switch triggerKey {
	case "tagihan-h7", "reminder-h3", "reminder-h5":
		settingKey = settings.KeyWAReminderAccountID
	case "jatuh_tempo", "trial_expired":
		settingKey = settings.KeyWADueAccountID
	case "limit_5hari", "isolir_20hari":
		settingKey = settings.KeyWALimitAccountID
	case "lunas":
		settingKey = settings.KeyWAPaymentAccountID
	default:
		settingKey = settings.KeyWABillingAccountID
	}

	accountID, err := s.Settings.GetString(ctx, settingKey)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(accountID) != "" {
		return accountID, nil
	}
	return s.Settings.GetString(ctx, settings.KeyWAAccountID)
}

func (r NotificationLogRepository) AlreadySent(ctx context.Context, billID int64, triggerKey string) (bool, error) {
	var count int
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM notification_logs
		WHERE bill_id = ?
		  AND trigger_key = ?
		  AND status = 'sent'
	`, billID, triggerKey).Scan(&count); err != nil {
		return false, fmt.Errorf("check notification log: %w", err)
	}
	if count > 0 {
		return true, nil
	}

	var queueCount int
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM whatsapp_queue
		WHERE bill_id = ?
		  AND trigger_key = ?
		  AND status IN ('pending', 'failed')
	`, billID, triggerKey).Scan(&queueCount); err != nil {
		return false, fmt.Errorf("check whatsapp queue: %w", err)
	}

	return queueCount > 0, nil
}

func (r NotificationLogRepository) Record(ctx context.Context, billID int64, triggerKey, sentTo, status, response string) error {
	return r.RecordWithMessage(ctx, billID, triggerKey, sentTo, status, response, "")
}

func (r NotificationLogRepository) RecordWithMessage(ctx context.Context, billID int64, triggerKey, sentTo, status, response, message string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO notification_logs (bill_id, trigger_key, sent_to, status, response_message, message)
		VALUES (?, ?, ?, ?, ?, ?)
	`, billID, triggerKey, sentTo, status, response, message)
	if err != nil {
		return fmt.Errorf("record notification log with message: %w", err)
	}
	return nil
}

type NotificationLog struct {
	ID              int64  `json:"id"`
	BillID          int64  `json:"bill_id"`
	TriggerKey      string `json:"trigger_key"`
	SentTo          string `json:"sent_to"`
	Status          string `json:"status"`
	ResponseMessage string `json:"response_message"`
	Message         string `json:"message"`
	CreatedAt       string `json:"created_at"`
}

func (r NotificationLogRepository) FindLogs(ctx context.Context, billID int64) ([]NotificationLog, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, bill_id, trigger_key, COALESCE(sent_to, '') AS sent_to, status, COALESCE(response_message, '') AS response_message, COALESCE(message, '') AS message, created_at
		FROM notification_logs
		WHERE bill_id = ?
		UNION ALL
		SELECT -id AS id, COALESCE(bill_id, 0) AS bill_id, COALESCE(trigger_key, '') AS trigger_key, to_number AS sent_to, 'queued' AS status, 
		       CASE 
		           WHEN error_message IS NOT NULL AND error_message != '' THEN error_message
		           ELSE 'Dalam Antrean'
		       END AS response_message,
		       body AS message,
		       created_at
		FROM whatsapp_queue
		WHERE bill_id = ? AND (status = 'pending' OR (status = 'failed' AND attempts < 3))
		ORDER BY created_at DESC, id DESC
	`, billID, billID)
	if err != nil {
		return nil, fmt.Errorf("find notification logs: %w", err)
	}
	defer rows.Close()

	items := []NotificationLog{}
	for rows.Next() {
		var item NotificationLog
		if err := rows.Scan(&item.ID, &item.BillID, &item.TriggerKey, &item.SentTo, &item.Status, &item.ResponseMessage, &item.Message, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification log: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
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

func formatDateLabel(raw string) string {
	value, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return raw
	}
	return value.Format("02-01-2006")
}

func (s WhatsAppService) ResolveChatbotSession(ctx context.Context, phone, accountID string) error {
	urlVal, err := s.Settings.GetString(ctx, settings.KeyWAGatewayURL)
	if err != nil {
		return err
	}
	urlVal = settings.ResolveWAGatewayURL(urlVal)

	apiKey, err := s.Settings.GetString(ctx, settings.KeyWAAPIKey)
	if err != nil {
		return err
	}
	if strings.TrimSpace(apiKey) == "" {
		apiKey = os.Getenv("DASHBOARD_INTERNAL_API_KEY")
	}
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("WA API Key is not configured")
	}

	timeoutSecs, _ := s.Settings.GetInt(ctx, "wa_client_timeout_seconds")
	if timeoutSecs <= 0 {
		timeoutSecs = 15
	}

	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: time.Duration(timeoutSecs) * time.Second}
	} else if client.Timeout == 0 {
		client.Timeout = time.Duration(timeoutSecs) * time.Second
	}

	escPhone := url.QueryEscape(phone)
	reqUrl := fmt.Sprintf("%s/api/v1/chatbot/sessions/%s/resolve", strings.TrimRight(urlVal, "/"), escPhone)

	reqBody, err := json.Marshal(map[string]string{
		"accountId": accountID,
	})
	if err != nil {
		return fmt.Errorf("marshal resolve request payload: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, reqUrl, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("create resolve request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-API-Key", apiKey)

	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("send resolve request HTTP: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return fmt.Errorf("whatsapp gateway resolve chatbot session returned status %d", response.StatusCode)
	}

	return nil
}

func truncateString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
