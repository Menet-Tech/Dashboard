package notifications

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

func (s WhatsAppService) renderHardcodedTemplate(ctx context.Context, payload BillMessagePayload) (string, error) {
	var renderedText string

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
			detail := strings.TrimRight(detailBlock.String(), "\n")

			var builder strings.Builder
			builder.WriteString("Pelanggan Yth,\n")
			builder.WriteString(fmt.Sprintf("Bapak/Ibu %s,\n\n", primaryName))

			period := groups[0].Period
			dueDateFormatted := formatDateLabel(targetDueDate)
			if dueDateFormatted == "" && len(groups) > 0 {
				dueDateFormatted = formatDateLabel(groups[len(groups)-1].DueDate)
			}
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
	}

	return renderedText, nil
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
