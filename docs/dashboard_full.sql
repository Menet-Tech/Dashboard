-- ============================================================
-- Dashboard Billing — Full Database Schema + Migration
-- Versi: v1 (Schema Dasar) + v2 (Notifikasi WA & Discord)
--
-- Jalankan sekali di phpMyAdmin pada database `dashboard`
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ============================================================
-- Database: `dashboard`
-- ============================================================

-- ============================================================
-- TABEL: ip_pools
-- ============================================================

CREATE TABLE IF NOT EXISTS `ip_pools` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `start_ip` varchar(15) NOT NULL,
  `end_ip` varchar(15) NOT NULL,
  `gateway` varchar(15) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`),
  KEY `idx_start_ip` (`start_ip`),
  KEY `idx_end_ip` (`end_ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `ip_pools` (`id`, `name`, `start_ip`, `end_ip`, `gateway`, `created_at`, `updated_at`) VALUES
(90, '10MBps', '192.168.10.1', '192.168.10.253', '192.168.10.254', '2026-03-02 09:42:31', '2026-03-09 13:30:38'),
(91, '20MBps', '192.168.20.1', '192.168.20.253', '192.168.20.254', '2026-03-02 09:42:53', '2026-03-09 13:30:46'),
(92, '30MBps', '192.168.30.1', '192.168.30.253', '192.168.30.254', '2026-03-02 09:43:07', '2026-03-09 13:30:54'),
(94, '50Mbps', '192.168.50.1', '192.168.50.100', '192.168.50.254', '2026-03-02 10:28:03', '2026-03-09 13:31:07');

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `update_ip_pool_timestamp` BEFORE UPDATE ON `ip_pools` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END $$
CREATE TRIGGER IF NOT EXISTS `validate_ip_format` BEFORE INSERT ON `ip_pools` FOR EACH ROW BEGIN
    IF NOT NEW.start_ip REGEXP '^([0-9]{1,3}.){3}[0-9]{1,3}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Format Start IP tidak valid';
    END IF;
    IF NOT NEW.end_ip REGEXP '^([0-9]{1,3}.){3}[0-9]{1,3}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Format End IP tidak valid';
    END IF;
    IF INET_ATON(NEW.start_ip) >= INET_ATON(NEW.end_ip) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start IP harus lebih kecil dari End IP';
    END IF;
END $$
DELIMITER ;

-- ============================================================
-- TABEL: paket_bandwidth
-- ============================================================

CREATE TABLE IF NOT EXISTS `paket_bandwidth` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `id_local_address` int(11) NOT NULL,
  `id_remote_address` int(11) NOT NULL,
  `speed_limit` varchar(50) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`),
  KEY `idx_id_local_address` (`id_local_address`),
  KEY `idx_id_remote_address` (`id_remote_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `paket_bandwidth` (`id`, `name`, `id_local_address`, `id_remote_address`, `speed_limit`, `price`, `created_at`, `updated_at`) VALUES
(27, 'Paket 10 Mbps', 90, 90, '10M/10M', 99000,  '2026-03-02 09:46:40', '2026-03-04 17:46:13'),
(28, 'Paket 20 Mbps', 91, 91, '20M/20M', 130000, '2026-03-02 09:46:59', '2026-03-09 13:19:11'),
(29, 'Paket 30 Mbps', 92, 92, '30M/30M', 180000, '2026-03-02 09:47:12', '2026-03-09 13:19:30'),
(32, 'Paket 50 Mbps', 94, 94, '50M/50M', 250000, '2026-03-02 12:11:11', '2026-03-09 13:19:41');

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `update_paket_timestamp` BEFORE UPDATE ON `paket_bandwidth` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Harga harus lebih dari 0';
    END IF;
END $$
CREATE TRIGGER IF NOT EXISTS `validate_paket_id_format` BEFORE INSERT ON `paket_bandwidth` FOR EACH ROW BEGIN
    IF NEW.id_local_address <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Local Address harus lebih besar dari 0';
    END IF;
    IF NEW.id_remote_address <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Remote Address harus lebih besar dari 0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ip_pools WHERE id = NEW.id_local_address) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Local Address tidak ditemukan di tabel ip_pools';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ip_pools WHERE id = NEW.id_remote_address) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Remote Address tidak ditemukan di tabel ip_pools';
    END IF;
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Harga harus lebih dari 0';
    END IF;
END $$
DELIMITER ;

-- ============================================================
-- TABEL: pelanggan (v1 + kolom v2: no_wa, serial_number_ont)
-- ============================================================

CREATE TABLE IF NOT EXISTS `pelanggan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama` varchar(100) NOT NULL,
  `no_wa` varchar(20) NULL COMMENT 'Nomor WhatsApp (format: 628xxxxxxxxxx)',
  `serial_number_ont` varchar(50) NULL COMMENT 'Serial Number ONT/Modem',
  `user_pppoe` varchar(50) NOT NULL,
  `password_pppoe` varchar(100) NOT NULL,
  `paket_id` int(11) NOT NULL,
  `jatuh_tempo` int(2) NOT NULL,
  `harga` int(11) NOT NULL DEFAULT 0,
  `status` enum('active','limit','tertunda','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_pppoe` (`user_pppoe`),
  KEY `idx_nama` (`nama`),
  KEY `idx_user_pppoe` (`user_pppoe`),
  KEY `idx_paket_id` (`paket_id`),
  KEY `idx_jatuh_tempo` (`jatuh_tempo`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `pelanggan` (`id`, `nama`, `no_wa`, `serial_number_ont`, `user_pppoe`, `password_pppoe`, `paket_id`, `jatuh_tempo`, `harga`, `status`, `created_at`, `updated_at`) VALUES
(2, 'elam',            NULL, NULL, 'elam',    '12345', 32, 16, 250000, 'active', '2026-03-09 14:09:31', '2026-03-10 09:33:23'),
(3, 'Irfan Dharmawan', NULL, NULL, 'irfan',   '12345', 32,  9, 250000, 'active', '2026-03-09 14:15:07', '2026-03-10 09:33:20'),
(5, 'Mursidahi',       NULL, NULL, 'mur',     '12345', 28,  9, 130000, 'active', '2026-03-09 14:38:31', '2026-03-10 09:33:18'),
(6, 'test',            NULL, NULL, 'admin',   '12345', 28, 12, 130000, 'active', '2026-03-09 14:42:55', '2026-03-10 09:33:21'),
(7, 'asd',             NULL, NULL, 'admin45', '12345', 28,  3, 130000, 'active', '2026-03-09 14:49:05', '2026-03-10 09:33:13'),
(8, '1213qwe',         NULL, NULL, 'qweas',   '12345', 28,  3, 130000, 'active', '2026-03-09 14:54:45', '2026-03-10 09:33:16');

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `update_pelanggan_timestamp` BEFORE UPDATE ON `pelanggan` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    IF NEW.jatuh_tempo < 1 OR NEW.jatuh_tempo > 31 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jatuh tempo harus antara 1-31';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM paket_bandwidth WHERE id = NEW.paket_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paket ID tidak ditemukan di tabel paket_bandwidth';
    END IF;
    SET NEW.harga = (SELECT price FROM paket_bandwidth WHERE id = NEW.paket_id);
END $$
CREATE TRIGGER IF NOT EXISTS `validate_pelanggan_data` BEFORE INSERT ON `pelanggan` FOR EACH ROW BEGIN
    IF NEW.jatuh_tempo < 1 OR NEW.jatuh_tempo > 31 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jatuh tempo harus antara 1-31';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM paket_bandwidth WHERE id = NEW.paket_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paket ID tidak ditemukan di tabel paket_bandwidth';
    END IF;
    SET NEW.harga = (SELECT price FROM paket_bandwidth WHERE id = NEW.paket_id);
END $$
DELIMITER ;

-- ============================================================
-- TABEL: tagihan
-- ============================================================

CREATE TABLE IF NOT EXISTS `tagihan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pelanggan_id` int(11) NOT NULL,
  `tanggal_tagihan` date NOT NULL,
  `tanggal_jatuh_tempo` date NOT NULL,
  `status_bayar` enum('belum','sudah') DEFAULT 'belum',
  `tanggal_bayar` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pelanggan_id` (`pelanggan_id`),
  KEY `idx_tanggal_tagihan` (`tanggal_tagihan`),
  KEY `idx_tanggal_jatuh_tempo` (`tanggal_jatuh_tempo`),
  KEY `idx_status_bayar` (`status_bayar`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `tagihan` (`id`, `pelanggan_id`, `tanggal_tagihan`, `tanggal_jatuh_tempo`, `status_bayar`, `tanggal_bayar`, `created_at`, `updated_at`) VALUES
(30, 2, '2026-03-13', '2026-03-16', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:15:56'),
(31, 3, '2026-03-06', '2026-03-09', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:15:59'),
(32, 5, '2026-03-06', '2026-03-09', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:16:01'),
(33, 6, '2026-03-09', '2026-03-12', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:15:58'),
(34, 7, '2026-02-28', '2026-03-03', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:16:05'),
(35, 8, '2026-02-28', '2026-03-03', 'sudah', NULL,         '2026-03-10 09:14:56', '2026-03-10 09:16:03'),
(36, 2, '2026-04-13', '2026-04-16', 'sudah', '2026-04-07', '2026-03-10 09:19:05', '2026-03-10 09:22:34'),
(37, 3, '2026-04-06', '2026-04-09', 'sudah', '2026-04-10', '2026-03-10 09:19:05', '2026-03-10 09:23:59'),
(38, 5, '2026-04-06', '2026-04-09', 'sudah', '2026-04-10', '2026-03-10 09:19:05', '2026-03-10 09:23:57'),
(39, 6, '2026-04-09', '2026-04-12', 'sudah', '2026-04-10', '2026-03-10 09:19:05', '2026-03-10 09:23:53'),
(40, 7, '2026-03-31', '2026-04-03', 'sudah', '2026-03-10', '2026-03-10 09:19:05', '2026-03-10 09:33:13'),
(41, 8, '2026-03-31', '2026-04-03', 'sudah', '2026-03-10', '2026-03-10 09:19:05', '2026-03-10 09:33:16'),
(42, 2, '2026-05-13', '2026-05-16', 'sudah', '2026-03-10', '2026-03-10 09:24:13', '2026-03-10 09:33:23'),
(43, 3, '2026-05-06', '2026-05-09', 'sudah', '2026-03-10', '2026-03-10 09:24:13', '2026-03-10 09:33:20'),
(44, 5, '2026-05-06', '2026-05-09', 'sudah', '2026-03-10', '2026-03-10 09:24:13', '2026-03-10 09:33:18'),
(45, 6, '2026-05-09', '2026-05-12', 'sudah', '2026-03-10', '2026-03-10 09:24:13', '2026-03-10 09:33:21');

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `update_tagihan_timestamp` BEFORE UPDATE ON `tagihan` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END $$
CREATE TRIGGER IF NOT EXISTS `validate_tagihan_dates` BEFORE INSERT ON `tagihan` FOR EACH ROW BEGIN
    IF NEW.tanggal_jatuh_tempo <= NEW.tanggal_tagihan THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tanggal jatuh tempo harus lebih besar dari tanggal tagihan';
    END IF;
END $$
DELIMITER ;

-- ============================================================
-- [v2] TABEL: wa_templates (Template Pesan WhatsApp)
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
-- [v2] TABEL: app_settings (Konfigurasi Discord & ISP)
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

INSERT INTO `app_settings` (`setting_key`, `setting_value`, `keterangan`) VALUES
('discord_webhook_tagihan', '', 'Webhook URL Discord — channel log generate tagihan bulanan'),
('discord_webhook_alert',   '', 'Webhook URL Discord — channel alert pelanggan jatuh tempo'),
('nama_isp',               'Menet Tech', 'Nama ISP yang tampil di footer pesan WA'),
('nomor_rekening',          '', 'Nomor rekening untuk instruksi pembayaran di pesan WA');

-- ============================================================
-- Foreign Key Constraints
-- ============================================================

ALTER TABLE `pelanggan`
  ADD CONSTRAINT `fk_paket_id` FOREIGN KEY (`paket_id`) REFERENCES `paket_bandwidth` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tagihan`
  ADD CONSTRAINT `fk_tagihan_pelanggan_id` FOREIGN KEY (`pelanggan_id`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- AUTO_INCREMENT values
-- ============================================================

ALTER TABLE `ip_pools`        MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=98;
ALTER TABLE `paket_bandwidth` MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;
ALTER TABLE `pelanggan`       MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;
ALTER TABLE `tagihan`         MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=46;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
