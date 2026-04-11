-- =====================================================================
-- DATABASE: isp_billing_netguard
-- VERSION: 1.0.2 FINAL + Production Upgrade (Combined)
-- DESCRIPTION: Skema database lengkap dengan seluruh upgrade.
--              Tidak ada duplikasi, siap untuk development maupun production.
-- =====================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+07:00";
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. DROP TABLES (Hanya untuk development - bersihkan semua)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `action_log`;
DROP TABLE IF EXISTS `payment_history`;
DROP TABLE IF EXISTS `tagihan`;
DROP TABLE IF EXISTS `template_wa`;
DROP TABLE IF EXISTS `pelanggan`;
DROP TABLE IF EXISTS `paket`;
DROP TABLE IF EXISTS `pengaturan`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `migrations`;
DROP TABLE IF EXISTS `login_attempts`;
DROP TABLE IF EXISTS `system_health_checks`;
DROP TABLE IF EXISTS `backup_logs`;

-- ---------------------------------------------------------------------
-- 2. CREATE TABLES (Skema Inti)
-- ---------------------------------------------------------------------

CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `nama_lengkap` VARCHAR(100) NOT NULL,
  `role` ENUM('admin','petugas') NOT NULL DEFAULT 'petugas',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME NULL,
  `password_updated_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Akun petugas/admin';

CREATE TABLE `pengaturan` (
  `key` VARCHAR(50) NOT NULL,
  `value` TEXT NOT NULL,
  `description` VARCHAR(255) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Konfigurasi sistem';

CREATE TABLE `paket` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nama_paket` VARCHAR(50) NOT NULL,
  `harga` DECIMAL(10,2) NOT NULL,
  `profile_mikrotik` VARCHAR(50) NOT NULL DEFAULT 'default',
  `profile_limit_mikrotik` VARCHAR(50) NOT NULL DEFAULT 'default-limit',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_nama_paket` (`nama_paket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Paket layanan internet';

CREATE TABLE `pelanggan` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_paket` INT UNSIGNED NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `user_pppoe` VARCHAR(50) NOT NULL,
  `pass_pppoe` VARCHAR(100) NOT NULL,
  `no_wa` VARCHAR(20) NOT NULL,
  `sn_ont` VARCHAR(50) NULL,
  `latitude` DECIMAL(10,8) NULL,
  `longitude` DECIMAL(11,8) NULL,
  `alamat` TEXT NULL,
  `tgl_jatuh_tempo` DATE NOT NULL COMMENT 'Tanggal jatuh tempo pembayaran tiap bulan',
  `status` ENUM('active','limit','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL COMMENT 'Soft delete',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_user_pppoe` (`user_pppoe`),
  KEY `idx_status` (`status`),
  KEY `idx_tgl_jatuh_tempo` (`tgl_jatuh_tempo`),
  KEY `idx_deleted_at` (`deleted_at`),
  FULLTEXT KEY `ft_nama_alamat` (`nama`, `alamat`),
  CONSTRAINT `fk_pelanggan_paket` FOREIGN KEY (`id_paket`) REFERENCES `paket` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data pelanggan ISP';

CREATE TABLE `template_wa` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(50) NOT NULL,
  `isi_pesan` TEXT NOT NULL,
  `trigger_event` ENUM('lunas','jatuh_tempo','reminder_7hari') NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_trigger_event` (`trigger_event`),
  KEY `idx_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Template pesan WhatsApp';

CREATE TABLE `tagihan` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_pelanggan` INT UNSIGNED NOT NULL,
  `periode` DATE NOT NULL COMMENT 'Bulan tagihan (format: YYYY-MM-01)',
  `tgl_tagihan` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tgl_bayar` DATETIME NULL,
  `harga` DECIMAL(10,2) NOT NULL,
  `status` ENUM('belum_bayar','menunggu_wa','lunas') NOT NULL DEFAULT 'belum_bayar',
  `metode_bayar` ENUM('cash','transfer','e_wallet','gateway','manual') NULL,
  `catatan_pembayaran` TEXT NULL,
  `bukti_pembayaran` VARCHAR(255) NULL,
  `paid_by_user_id` INT UNSIGNED NULL,
  `updated_by_user_id` INT UNSIGNED NULL,
  `snap_token` VARCHAR(64) NULL,
  `redo_expired_at` DATETIME NULL COMMENT 'Batas waktu tombol Redo (3 jam setelah klik Lunas)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_snap_token` (`snap_token`),
  KEY `idx_status` (`status`),
  KEY `idx_periode` (`periode`),
  KEY `idx_redo_expired` (`redo_expired_at`),
  KEY `idx_redo_expired_status` (`redo_expired_at`, `status`),
  KEY `idx_id_pelanggan_periode` (`id_pelanggan`,`periode`),
  CONSTRAINT `fk_tagihan_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tagihan_paid_by_user` FOREIGN KEY (`paid_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tagihan_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data tagihan bulanan';

CREATE TABLE `action_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_pelanggan` INT UNSIGNED NULL,
  `user_id` INT UNSIGNED NULL,
  `tipe_aksi` VARCHAR(50) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `pesan` TEXT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_id_pelanggan` (`id_pelanggan`),
  KEY `idx_tipe_aksi` (`tipe_aksi`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_action_log_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_action_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log semua aksi sistem';

CREATE TABLE `user_sessions` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `user_agent` TEXT NOT NULL,
  `payload` TEXT NOT NULL,
  `last_activity` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_last_activity` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(191) NOT NULL,
  `executed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payment_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tagihan_id` INT UNSIGNED NOT NULL,
  `id_pelanggan` INT UNSIGNED NOT NULL,
  `metode_bayar` ENUM('cash','transfer','e_wallet','gateway','manual') NOT NULL DEFAULT 'manual',
  `jumlah_bayar` DECIMAL(10,2) NOT NULL,
  `dibayar_pada` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `catatan` TEXT NULL,
  `bukti_pembayaran` VARCHAR(255) NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tagihan_id` (`tagihan_id`),
  KEY `idx_id_pelanggan` (`id_pelanggan`),
  KEY `idx_created_by_user_id` (`created_by_user_id`),
  CONSTRAINT `fk_payment_history_tagihan` FOREIGN KEY (`tagihan_id`) REFERENCES `tagihan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_history_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_history_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_username_attempted_at` (`username`, `attempted_at`),
  KEY `idx_ip_attempted_at` (`ip_address`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `system_health_checks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_name` VARCHAR(50) NOT NULL,
  `status` ENUM('ok','warning','failed') NOT NULL DEFAULT 'ok',
  `message` TEXT NULL,
  `checked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_service_name_checked_at` (`service_name`, `checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `backup_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `status` ENUM('success','failed') NOT NULL DEFAULT 'success',
  `size_bytes` BIGINT UNSIGNED NULL,
  `message` TEXT NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created_by_user_id` (`created_by_user_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_backup_logs_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

DELIMITER //

CREATE TRIGGER `trg_pengaturan_before_update` BEFORE UPDATE ON `pengaturan`
FOR EACH ROW
BEGIN
    SET NEW.updated_at = NOW();
END//

DELIMITER ;

-- ---------------------------------------------------------------------
-- 4. VIEWS
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS `view_pelanggan_summary`;
CREATE VIEW `view_pelanggan_summary` AS
SELECT 
    COUNT(*) AS total_pelanggan,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS total_active,
    SUM(CASE WHEN status = 'limit' THEN 1 ELSE 0 END) AS total_limit,
    SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS total_inactive,
    SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS total_non_deleted
FROM pelanggan;

DROP VIEW IF EXISTS `view_pendapatan_bulanan`;
CREATE VIEW `view_pendapatan_bulanan` AS
SELECT 
    DATE_FORMAT(periode, '%Y-%m') AS bulan,
    COUNT(*) AS total_tagihan,
    SUM(CASE WHEN status = 'lunas' THEN harga ELSE 0 END) AS pendapatan_terkumpul,
    SUM(harga) AS potensi_pendapatan
FROM tagihan
GROUP BY DATE_FORMAT(periode, '%Y-%m')
ORDER BY bulan DESC;

DROP VIEW IF EXISTS `view_pelanggan_tagihan_terakhir`;
CREATE VIEW `view_pelanggan_tagihan_terakhir` AS
SELECT 
    p.id,
    p.nama,
    p.user_pppoe,
    p.status AS status_pelanggan,
    p.tgl_jatuh_tempo,
    p.no_wa,
    pk.nama_paket,
    pk.harga,
    t.id AS id_tagihan_terakhir,
    t.periode AS periode_tagihan,
    t.status AS status_tagihan,
    t.tgl_bayar,
    DATEDIFF(CURDATE(), p.tgl_jatuh_tempo) AS hari_tunggakan
FROM pelanggan p
JOIN paket pk ON p.id_paket = pk.id
LEFT JOIN (
    SELECT t1.*
    FROM tagihan t1
    INNER JOIN (
        SELECT id_pelanggan, MAX(periode) AS max_periode
        FROM tagihan
        GROUP BY id_pelanggan
    ) t2 ON t1.id_pelanggan = t2.id_pelanggan AND t1.periode = t2.max_periode
) t ON p.id = t.id_pelanggan
WHERE p.deleted_at IS NULL;

DROP VIEW IF EXISTS `view_jatuh_tempo_hari_ini`;
CREATE VIEW `view_jatuh_tempo_hari_ini` AS
SELECT 
    p.id,
    p.nama,
    p.user_pppoe,
    p.no_wa,
    pk.nama_paket,
    t.id AS id_tagihan,
    t.periode,
    t.harga,
    t.status
FROM pelanggan p
JOIN paket pk ON p.id_paket = pk.id
LEFT JOIN tagihan t ON p.id = t.id_pelanggan AND t.periode = DATE_FORMAT(CURDATE(), '%Y-%m-01')
WHERE p.status = 'active' 
  AND p.deleted_at IS NULL
  AND p.tgl_jatuh_tempo = CURDATE();

-- ---------------------------------------------------------------------
-- 5. STORED PROCEDURES
-- ---------------------------------------------------------------------

DELIMITER //

DROP PROCEDURE IF EXISTS `sp_generate_monthly_bills`//
CREATE PROCEDURE `sp_generate_monthly_bills`(IN target_periode DATE)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_id_pelanggan INT;
    DECLARE v_harga DECIMAL(10,2);
    DECLARE cur CURSOR FOR 
        SELECT p.id, pk.harga 
        FROM pelanggan p
        JOIN paket pk ON p.id_paket = pk.id
        WHERE p.status IN ('active','limit') 
          AND p.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM tagihan t 
              WHERE t.id_pelanggan = p.id AND t.periode = target_periode
          );
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    START TRANSACTION;
    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_id_pelanggan, v_harga;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        INSERT INTO tagihan (id_pelanggan, periode, tgl_tagihan, harga, status)
        VALUES (v_id_pelanggan, target_periode, NOW(), v_harga, 'belum_bayar');
        
        INSERT INTO action_log (id_pelanggan, tipe_aksi, status, pesan)
        VALUES (v_id_pelanggan, 'GENERATE_TAGIHAN', 'success', CONCAT('Tagihan periode ', target_periode, ' dibuat otomatis'));
    END LOOP;
    CLOSE cur;
    COMMIT;
    
    SELECT CONCAT('Tagihan untuk periode ', target_periode, ' berhasil digenerate.') AS message;
END//

DROP PROCEDURE IF EXISTS `sp_soft_delete_pelanggan`//
CREATE PROCEDURE `sp_soft_delete_pelanggan`(IN pelanggan_id INT)
BEGIN
    UPDATE pelanggan 
    SET deleted_at = NOW(), status = 'inactive'
    WHERE id = pelanggan_id;
    
    INSERT INTO action_log (id_pelanggan, tipe_aksi, status, pesan)
    VALUES (pelanggan_id, 'SOFT_DELETE', 'success', 'Pelanggan dihapus secara soft delete');
END//

DELIMITER ;

-- ---------------------------------------------------------------------
-- 6. EVENT SCHEDULER (Hanya untuk generate tagihan bulanan)
-- ---------------------------------------------------------------------

-- Pastikan event scheduler aktif di server: SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS `ev_generate_tagihan_bulanan`;
CREATE EVENT `ev_generate_tagihan_bulanan`
ON SCHEDULE EVERY 1 MONTH
STARTS CONCAT(DATE_FORMAT(CURDATE(), '%Y-%m-01'), ' 00:05:00')
ON COMPLETION PRESERVE
ENABLE
COMMENT 'Generate tagihan untuk semua pelanggan aktif setiap awal bulan'
DO
    CALL sp_generate_monthly_bills(DATE_FORMAT(CURDATE(), '%Y-%m-01'));

-- ---------------------------------------------------------------------
-- 7. DATA AWAL (SEEDS)
-- ---------------------------------------------------------------------

INSERT INTO `users` (`username`, `password_hash`, `nama_lengkap`, `role`) VALUES
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin');

INSERT INTO `pengaturan` (`key`, `value`, `description`) VALUES
('nama_isp', 'NetGuard ISP', 'Nama ISP yang ditampilkan di header'),
('alamat_isp', 'Jl. Teknologi No. 123, Jakarta', 'Alamat kantor'),
('no_rekening', '1234567890 (BCA a.n. PT NetGuard)', 'Informasi rekening untuk pembayaran'),
('whatsapp_gateway_url', 'https://api.whatsapp.com/send', 'URL endpoint gateway WhatsApp'),
('whatsapp_api_key', '', 'API Key jika menggunakan gateway berbayar'),
('discord_billing_url', '', 'Webhook URL Discord untuk notifikasi billing'),
('discord_alert_url', '', 'Webhook URL Discord untuk alert sistem'),
('mikrotik_host', '192.168.88.1', 'IP Address Router MikroTik'),
('mikrotik_user', 'api', 'Username API MikroTik'),
('mikrotik_pass', '', 'Password API MikroTik'),
('snap_midtrans_server_key', '', 'Midtrans Server Key'),
('snap_midtrans_client_key', '', 'Midtrans Client Key'),
('snap_is_production', 'false', 'Mode production Midtrans (true/false)'),
('billing_auto_generate_enabled', 'true', 'Aktifkan generate tagihan otomatis bulanan'),
('billing_auto_generate_day', '1', 'Hari generate tagihan otomatis setiap bulan'),
('billing_auto_generate_time', '00:05', 'Jam generate tagihan otomatis setiap bulan'),
('login_rate_limit_max_attempts', '5', 'Maksimal percobaan login per 15 menit'),
('login_rate_limit_window_minutes', '15', 'Jendela rate limit login dalam menit'),
('cron_last_run_at', '', 'Waktu terakhir scheduler berjalan'),
('cron_last_status', '', 'Status terakhir scheduler'),
('backup_retention_days', '14', 'Retensi backup otomatis dalam hari'),
('wa_status_panel_last_check', '', 'Status cache panel WA terakhir'),
('discord_bot_status_last_check', '', 'Status cache bot Discord terakhir'),
('mikrotik_status_last_check', '', 'Status cache MikroTik terakhir');

INSERT INTO `paket` (`nama_paket`, `harga`, `profile_mikrotik`, `profile_limit_mikrotik`) VALUES
('Home 10Mbps', 150000.00, '10M-basic', '10M-limit'),
('Home 20Mbps', 250000.00, '20M-standard', '20M-limit'),
('Gamer 50Mbps', 450000.00, '50M-gamer', '50M-limit'),
('Bisnis 100Mbps', 950000.00, '100M-business', '100M-limit');

INSERT INTO `template_wa` (`nama`, `isi_pesan`, `trigger_event`) VALUES
('Pembayaran Lunas', 
'Halo {nama},\n\nPembayaran tagihan internet periode {periode} sebesar Rp {harga} telah kami terima. Layanan Anda akan tetap aktif.\n\nTerima kasih.\n- {nama_isp}', 
'lunas'),
('Jatuh Tempo Hari Ini', 
'Halo {nama},\n\nTagihan internet Anda sebesar Rp {harga} untuk periode {periode} jatuh tempo hari ini. Segera lakukan pembayaran agar layanan tidak terganggu.\n\nRekening: {no_rekening}\n\n- {nama_isp}', 
'jatuh_tempo'),
('Reminder 7 Hari', 
'Halo {nama},\n\nMengingatkan bahwa tagihan internet Anda sebesar Rp {harga} akan jatuh tempo dalam 7 hari ({tgl_jatuh_tempo}). Mohon siapkan pembayaran.\n\nTerima kasih.\n- {nama_isp}', 
'reminder_7hari');

INSERT INTO `pelanggan` (`id_paket`, `nama`, `user_pppoe`, `pass_pppoe`, `no_wa`, `sn_ont`, `latitude`, `longitude`, `alamat`, `tgl_jatuh_tempo`, `status`) VALUES
(1, 'Budi Santoso', 'budi_pppoe', 'pass123', '6281234567890', 'SN123456', -6.2087634, 106.8455990, 'Jl. Sudirman No. 10, Jakarta', DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'active'),
(2, 'Siti Aminah', 'siti_pppoe', 'pass456', '6289876543210', 'SN789012', -6.2293867, 106.8243265, 'Jl. Thamrin No. 25, Jakarta', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'active'),
(3, 'Agus Prasetyo', 'agus_pppoe', 'pass789', '6281112223334', 'SN345678', -7.2574719, 112.7520883, 'Jl. Ahmad Yani No. 5, Surabaya', DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'limit');

INSERT INTO `tagihan` (`id_pelanggan`, `periode`, `tgl_tagihan`, `harga`, `status`) VALUES
(1, DATE_FORMAT(CURDATE(), '%Y-%m-01'), NOW(), 150000.00, 'belum_bayar'),
(2, DATE_FORMAT(CURDATE(), '%Y-%m-01'), NOW(), 250000.00, 'menunggu_wa'),
(3, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'), DATE_SUB(NOW(), INTERVAL 1 MONTH), 450000.00, 'lunas'),
(3, DATE_FORMAT(CURDATE(), '%Y-%m-01'), NOW(), 450000.00, 'belum_bayar');

COMMIT;

-- =====================================================================
-- END OF COMBINED SQL FILE (Version 1.0.2 + Full Production Upgrade)
-- =====================================================================