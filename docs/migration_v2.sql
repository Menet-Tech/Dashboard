-- ============================================================
-- Dashboard Billing — Migration v2
-- Fitur: Template WA, Notifikasi Discord, No WA Pelanggan
-- Jalankan di phpMyAdmin atau MySQL CLI pada database `dashboard`
-- ============================================================

-- 1. Tambah kolom no_wa dan serial_number_ont ke tabel pelanggan
ALTER TABLE `pelanggan`
  ADD COLUMN `no_wa` VARCHAR(20) NULL COMMENT 'Nomor WhatsApp (format: 628xxxxxxxxxx)' AFTER `nama`,
  ADD COLUMN `serial_number_ont` VARCHAR(50) NULL COMMENT 'Serial Number ONT/Modem' AFTER `no_wa`;

-- ============================================================
-- 2. Buat tabel wa_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS `wa_templates` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `jenis` ENUM('tagihan','pembayaran','peringatan') NOT NULL,
  `judul` VARCHAR(100) NOT NULL,
  `isi_pesan` TEXT NOT NULL COMMENT 'Variabel: {nama} {no_wa} {paket} {harga} {bulan} {jatuh_tempo} {tanggal_bayar} {nama_isp} {no_rekening}',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jenis` (`jenis`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert 3 default templates
INSERT INTO `wa_templates` (`jenis`, `judul`, `isi_pesan`) VALUES
(
  'tagihan',
  'Tagihan Bulanan',
  'Halo *{nama}*,

Tagihan internet bulan *{bulan}* telah diterbitkan.

📋 *Detail Tagihan:*
- Paket: {paket}
- Nominal: Rp {harga}
- Jatuh Tempo: {jatuh_tempo}

Silakan lakukan pembayaran sebelum tanggal jatuh tempo.

💳 *Info Pembayaran:*
No. Rekening: {no_rekening}

Terima kasih, _{nama_isp}_'
),
(
  'pembayaran',
  'Konfirmasi Pembayaran Diterima',
  'Halo *{nama}*,

✅ Pembayaran tagihan internet bulan *{bulan}* telah kami terima.

📋 *Detail:*
- Paket: {paket}
- Nominal: Rp {harga}
- Tanggal Bayar: {tanggal_bayar}

Terima kasih telah membayar tepat waktu! 🙏

_{nama_isp}_'
),
(
  'peringatan',
  'Peringatan Jatuh Tempo',
  'Halo *{nama}*,

⚠️ Tagihan internet bulan *{bulan}* Anda belum dibayar.

📋 *Detail Tagihan:*
- Paket: {paket}
- Nominal: Rp {harga}
- Jatuh Tempo: {jatuh_tempo}

Mohon segera lakukan pembayaran untuk menghindari gangguan layanan.

💳 *Info Pembayaran:*
No. Rekening: {no_rekening}

Terima kasih, _{nama_isp}_'
);

-- ============================================================
-- 3. Buat tabel app_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NULL,
  `keterangan` VARCHAR(255) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert default settings
INSERT INTO `app_settings` (`setting_key`, `setting_value`, `keterangan`) VALUES
('discord_webhook_tagihan', '', 'Webhook URL Discord — channel log generate tagihan bulanan'),
('discord_webhook_alert',   '', 'Webhook URL Discord — channel alert pelanggan jatuh tempo'),
('nama_isp',               'Menet Tech', 'Nama ISP yang tampil di footer pesan WA'),
('nomor_rekening',          '', 'Nomor rekening untuk instruksi pembayaran di pesan WA');
