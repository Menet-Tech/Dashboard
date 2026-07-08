package audit

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"menettech/dashboard/backend/internal/notifications"
)

type Entry struct {
	ID          int64   `json:"id"`
	UserID      *int64  `json:"user_id,omitempty"`
	Username    *string `json:"username,omitempty"`
	PelangganID *int64  `json:"pelanggan_id,omitempty"`
	Action      string  `json:"action"`
	Message     string  `json:"message"`
	IPAddress   *string `json:"ip_address,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
	Discord    notifications.DiscordSender
}

func (s Service) Record(ctx context.Context, userID *int64, pelangganID *int64, action, message string) error {
	return s.RecordWithIP(ctx, userID, pelangganID, action, message, "")
}

func (s Service) RecordWithIP(ctx context.Context, userID *int64, pelangganID *int64, action, message, ip string) error {
	action = strings.TrimSpace(action)
	if action == "" {
		return nil
	}
	err := s.Repository.Insert(ctx, userID, pelangganID, action, strings.TrimSpace(message), strings.TrimSpace(ip))
	if err != nil {
		return err
	}

	if s.Discord != nil {
		go s.sendDiscordNotification(context.Background(), userID, action, message, ip)
	}

	return nil
}

func (s Service) sendDiscordNotification(ctx context.Context, userID *int64, action, message, ip string) {
	var username string = "Sistem"
	if userID != nil && *userID > 0 {
		_ = s.Repository.DB.QueryRowContext(ctx, "SELECT username FROM users WHERE id = ?", *userID).Scan(&username)
	}

	title := ""
	description := ""
	color := 3447003 // Default Blue (#3498db)

	actionLower := strings.ToLower(action)

	switch actionLower {
	case "auth.login":
		title = "🔓 Login Berhasil"
		description = fmt.Sprintf("Admin/Staff **%s** berhasil masuk ke sistem.", username)
		color = 3066993 // Green (#2ecc71)
	case "auth.login.failed":
		title = "⚠️ Login Gagal"
		description = fmt.Sprintf("Percobaan login gagal untuk username: **%s**", message)
		color = 15158332 // Red (#e74c3c)
	case "auth.logout":
		title = "🔒 Logout"
		description = fmt.Sprintf("Admin/Staff **%s** telah keluar dari sistem.", username)
		color = 10066329 // Light Gray (#999999)
	case "customer.create":
		title = "👤 Pelanggan Baru Ditambahkan"
		description = fmt.Sprintf("Admin/Staff **%s** menambahkan pelanggan baru ke sistem.", username)
		color = 3066993 // Green
	case "customer.update":
		title = "👤 Data Pelanggan Diperbarui"
		description = fmt.Sprintf("Admin/Staff **%s** memperbarui data pelanggan.", username)
		color = 15105570 // Orange (#e67e22)
	case "customer.update_status":
		title = "🔄 Status Pelanggan Diubah"
		description = fmt.Sprintf("Admin/Staff **%s** mengubah status pelanggan.", username)
		color = 10181046 // Purple (#9b59b6)
	case "customer.delete":
		title = "🗑️ Pelanggan Dihapus (Tagihan Terhapus)"
		description = fmt.Sprintf("Admin/Staff **%s** menghapus data pelanggan.", username)
		color = 15158332
	case "customer.bulk_delete":
		title = "🗑️ Pelanggan Dihapus secara Massal"
		description = fmt.Sprintf("Admin/Staff **%s** menghapus beberapa data pelanggan sekaligus.", username)
		color = 15158332
	case "bills.confirmations.approve":
		title = "✅ Bukti Pembayaran Disetujui"
		description = fmt.Sprintf("Admin/Staff **%s** menyetujui konfirmasi bukti pembayaran.", username)
		color = 3066993
	case "bills.confirmations.reject":
		title = "❌ Bukti Pembayaran Ditolak"
		description = fmt.Sprintf("Admin/Staff **%s** menolak konfirmasi bukti pembayaran.", username)
		color = 15158332
	}

	// 2. Package CRUD
	if strings.HasPrefix(actionLower, "post /api/v1/packages") {
		title = "📦 Paket Baru Dibuat"
		description = fmt.Sprintf("Admin/Staff **%s** membuat paket internet baru.", username)
		color = 3447003
	} else if strings.HasPrefix(actionLower, "put /api/v1/packages/") {
		title = "📦 Paket Diubah"
		description = fmt.Sprintf("Admin/Staff **%s** memperbarui data paket internet.", username)
		color = 10181046 // Purple (#9b59b6)
	} else if strings.HasPrefix(actionLower, "delete /api/v1/packages/") {
		title = "🗑️ Paket Dihapus"
		description = fmt.Sprintf("Admin/Staff **%s** menghapus paket internet.", username)
		color = 15158332
	}

	// 3. User (Staff) CRUD & Reset Password
	if strings.HasPrefix(actionLower, "post /api/v1/users") && strings.HasSuffix(actionLower, "/reset-password") {
		title = "🔑 Password Tim Direset"
		description = fmt.Sprintf("Admin/Staff **%s** mereset password salah satu akun staff.", username)
		color = 15158332
	} else if strings.HasPrefix(actionLower, "post /api/v1/users") {
		title = "👥 Akun Tim Baru Dibuat"
		description = fmt.Sprintf("Admin/Staff **%s** menambahkan akun staff baru.", username)
		color = 3447003
	} else if strings.HasPrefix(actionLower, "put /api/v1/users/") {
		title = "👥 Akun Tim Diubah"
		description = fmt.Sprintf("Admin/Staff **%s** mengubah detail data akun staff.", username)
		color = 10181046
	} else if strings.HasPrefix(actionLower, "delete /api/v1/users/") {
		title = "👥 Akses Akun Tim Dihapus"
		description = fmt.Sprintf("Admin/Staff **%s** menghapus akses akun staff dari sistem.", username)
		color = 15158332
	}

	// 4. Bills Generation
	if strings.HasPrefix(actionLower, "post /api/v1/bills/generate") {
		title = "📢 Pembuatan Tagihan Massal"
		description = fmt.Sprintf("Admin/Staff **%s** men-generate tagihan baru di sistem.", username)
		color = 3447003
	}

	// 6. Payment Confirmation Rejection
	if strings.HasPrefix(actionLower, "post /api/v1/bills/confirmations/") && strings.HasSuffix(actionLower, "/reject") {
		title = "❌ Bukti Pembayaran Ditolak"
		description = fmt.Sprintf("Admin/Staff **%s** menolak konfirmasi bukti pembayaran.", username)
		color = 15158332
	}

	if title != "" {
		fields := []notifications.EmbedField{
			{Name: "Pelaku", Value: username, Inline: true},
		}
		if ip != "" {
			fields = append(fields, notifications.EmbedField{Name: "Alamat IP", Value: ip, Inline: true})
		}
		if message != "" && !strings.HasPrefix(message, "status=") {
			fields = append(fields, notifications.EmbedField{Name: "Keterangan", Value: message, Inline: false})
		}
		_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
			Title:       title,
			Description: description,
			Color:       color,
			Fields:      fields,
		})
	}
}

func (s Service) List(ctx context.Context, limit int) ([]Entry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.Repository.List(ctx, limit)
}

func (r Repository) Insert(ctx context.Context, userID *int64, pelangganID *int64, action, message, ip string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO action_logs (user_id, pelanggan_id, action, message, ip_address)
		VALUES (?, ?, ?, ?, ?)
	`, userID, pelangganID, action, message, nullString(ip))
	if err != nil {
		return fmt.Errorf("insert action log: %w", err)
	}
	return nil
}

func (r Repository) List(ctx context.Context, limit int) ([]Entry, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT al.id, al.user_id, u.username, al.pelanggan_id, al.action,
		       COALESCE(al.message, ''), al.ip_address, al.created_at
		FROM action_logs al
		LEFT JOIN users u ON u.id = al.user_id
		ORDER BY al.id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list action logs: %w", err)
	}
	defer rows.Close()

	items := make([]Entry, 0, limit)
	for rows.Next() {
		var item Entry
		if err := rows.Scan(&item.ID, &item.UserID, &item.Username, &item.PelangganID, &item.Action, &item.Message, &item.IPAddress, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan action log: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
