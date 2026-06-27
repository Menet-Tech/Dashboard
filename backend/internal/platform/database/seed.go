package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

func Seed(db *sql.DB) error {
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Operational tables to clean for seeding
	tables := []string{
		"payment_history", "tagihan", "pelanggan", "paket", "vouchers",
		"customer_vouchers", "voucher_usage_logs", "odp", "tickets",
		"ticket_messages", "payment_confirmations",
	}
	for _, t := range tables {
		_, _ = tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s", t))
		_, _ = tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM sqlite_sequence WHERE name='%s'", t))
	}

	// 1. Seed Packages (paket)
	packages := []struct {
		ID        int
		Nama      string
		Speed     int
		Harga     int
		Deskripsi string
	}{
		{1, "Paket Basic 10Mbps", 10, 150000, "Paket internet basic cocok untuk keluarga kecil"},
		{2, "Paket Pro 30Mbps", 30, 250000, "Paket internet cepat untuk kerja & streaming HD"},
		{3, "Paket Gamer 100Mbps", 100, 450000, "Paket internet ultra cepat dengan low latency"},
	}

	for _, p := range packages {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO paket (id, nama, kecepatan_mbps, harga, deskripsi)
			VALUES (?, ?, ?, ?, ?)
		`, p.ID, p.Nama, p.Speed, p.Harga, p.Deskripsi)
		if err != nil {
			return fmt.Errorf("seed packages: %w", err)
		}
	}

	// 2. Seed Customers (pelanggan)
	customers := []struct {
		ID         int
		Nama       string
		PaketID    int
		PPPoEUser  string
		PPPoEPass  string
		NoWA       string
		SNOnt      string
		JatuhTempo int
		Status     string
		Alamat     string
	}{
		{1, "Budi Santoso", 1, "budi", "budi123", "081234567890", "ZTEG12345678", 5, "active", "Jl. Merdeka No. 1"},
		{2, "Ani Wijaya", 2, "ani", "ani123", "082345678901", "HWTC87654321", 10, "active", "Jl. Mawar No. 2"},
		{3, "Joko Widodo", 3, "joko", "joko123", "083456789012", "FHTT11223344", 15, "limit", "Jl. Melati No. 3"},
		{4, "Siti Rahma", 1, "siti", "siti123", "084567890123", "ZTEG55667788", 20, "non_active", "Jl. Anggrek No. 4"},
		{5, "Irfan Pratama", 2, "irfan", "irfan123", "085678901234", "HWTC99001122", 25, "active", "Jl. Flamboyan No. 5"},
	}

	for _, c := range customers {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO pelanggan (id, nama, paket_id, user_pppoe, password_pppoe, nomor_wa, sn_ont, tgl_jatuh_tempo, status, alamat)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, c.ID, c.Nama, c.PaketID, c.PPPoEUser, c.PPPoEPass, c.NoWA, c.SNOnt, c.JatuhTempo, c.Status, c.Alamat)
		if err != nil {
			return fmt.Errorf("seed customers: %w", err)
		}
	}

	// 3. Seed Bills (tagihan)
	now := time.Now()
	prevMonth := now.AddDate(0, -1, 0)
	prevPeriod := prevMonth.Format("2006-01")
	currPeriod := now.Format("2006-01")

	bills := []struct {
		ID            int
		CustomerID    int
		PaketID       int
		Periode       string
		InvoiceNumber string
		Nominal       int
		JatuhTempo    string
		Status        string
		PaidAt        sql.NullString
		PaymentMethod sql.NullString
		PaidByUserID  sql.NullInt64
	}{
		// Customer 1: Paid last month, Unpaid this month
		{1, 1, 1, prevPeriod, "INV/" + prevMonth.Format("200602") + "/0001", 150000, prevMonth.Format("2006-01") + "-05", "lunas", sql.NullString{String: prevMonth.Format("2006-01") + "-04 10:00:00", Valid: true}, sql.NullString{String: "transfer", Valid: true}, sql.NullInt64{Int64: 1, Valid: true}},
		{2, 1, 1, currPeriod, "INV/" + now.Format("200601") + "/0001", 150000, now.Format("2006-01") + "-05", "belum_bayar", sql.NullString{}, sql.NullString{}, sql.NullInt64{}},

		// Customer 2: Paid last month, Unpaid this month
		{3, 2, 2, prevPeriod, "INV/" + prevMonth.Format("200602") + "/0002", 250000, prevMonth.Format("2006-01") + "-10", "lunas", sql.NullString{String: prevMonth.Format("2006-01") + "-09 11:00:00", Valid: true}, sql.NullString{String: "transfer", Valid: true}, sql.NullInt64{Int64: 1, Valid: true}},
		{4, 2, 2, currPeriod, "INV/" + now.Format("200601") + "/0002", 250000, now.Format("2006-01") + "-10", "belum_bayar", sql.NullString{}, sql.NullString{}, sql.NullInt64{}},

		// Customer 3: Unpaid last month (overdue), Unpaid this month
		{5, 3, 3, prevPeriod, "INV/" + prevMonth.Format("200602") + "/0003", 450000, prevMonth.Format("2006-01") + "-15", "belum_bayar", sql.NullString{}, sql.NullString{}, sql.NullInt64{}},
		{6, 3, 3, currPeriod, "INV/" + now.Format("200601") + "/0003", 450000, now.Format("2006-01") + "-15", "belum_bayar", sql.NullString{}, sql.NullString{}, sql.NullInt64{}},

		// Customer 5: Pending paid this month (waiting confirmation / cancel window)
		{7, 5, 2, currPeriod, "INV/" + now.Format("200601") + "/0005", 250000, now.Format("2006-01") + "-25", "pending_paid", sql.NullString{}, sql.NullString{String: "transfer", Valid: true}, sql.NullInt64{Int64: 1, Valid: true}},
	}

	for _, b := range bills {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status, paid_at, payment_method, paid_by_user_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, b.ID, b.CustomerID, b.PaketID, b.Periode, b.InvoiceNumber, b.Nominal, b.JatuhTempo, b.Status, b.PaidAt, b.PaymentMethod, b.PaidByUserID)
		if err != nil {
			return fmt.Errorf("seed bills: %w", err)
		}
	}

	// 4. Seed Vouchers
	vouchers := []struct {
		Code        string
		Amount      int
		Type        string
		TotalCycles int
		Description string
	}{
		{"DISKON10K", 10000, "one-time", 1, "Voucher Diskon 10 Ribu Sekali Pakai"},
		{"DISKON50K2X", 50000, "multi-use", 2, "Voucher Diskon 50 Ribu untuk 2 Bulan"},
		{"DISKONPERM", 25000, "permanent", 0, "Voucher Diskon 25 Ribu Permanen"},
	}
	for _, v := range vouchers {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO vouchers (code, amount, type, total_cycles, description)
			VALUES (?, ?, ?, ?, ?)
		`, v.Code, v.Amount, v.Type, v.TotalCycles, v.Description)
		if err != nil {
			return fmt.Errorf("seed vouchers: %w", err)
		}
	}

	// 5. Seed ODPs
	odps := []struct {
		Nama      string
		Lokasi    string
		Deskripsi string
	}{
		{"ODP-A01", "Jl. Raya Merdeka Utama No. 1", "ODP area depan ruko utama"},
		{"ODP-B02", "Jl. Mawar Indah Blok B No. 10", "ODP tiang samping pos satpam"},
	}
	for _, o := range odps {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO odp (nama, lokasi, deskripsi)
			VALUES (?, ?, ?)
		`, o.Nama, o.Lokasi, o.Deskripsi)
		if err != nil {
			return fmt.Errorf("seed odps: %w", err)
		}
	}

	// Associate some customers with seeded ODPs
	_, _ = tx.ExecContext(ctx, "UPDATE pelanggan SET odp_id = 1 WHERE id IN (1, 2)")
	_, _ = tx.ExecContext(ctx, "UPDATE pelanggan SET odp_id = 2 WHERE id IN (3, 5)")

	// 6. Seed Tickets
	tickets := []struct {
		CustomerID int
		Nama       string
		NoHP       string
		Alamat     string
		Kendala    string
		Status     string
	}{
		{1, "Budi Santoso", "081234567890", "Jl. Merdeka No. 1", "Koneksi sering putus di malam hari", "open"},
		{2, "Ani Wijaya", "082345678901", "Jl. Mawar No. 2", "Pengajuan upgrade paket ke 30Mbps", "closed"},
	}
	for _, t := range tickets {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO tickets (pelanggan_id, nama, no_hp, alamat, kendala, status)
			VALUES (?, ?, ?, ?, ?, ?)
		`, t.CustomerID, t.Nama, t.NoHP, t.Alamat, t.Kendala, t.Status)
		if err != nil {
			return fmt.Errorf("seed tickets: %w", err)
		}
	}

	return tx.Commit()
}
