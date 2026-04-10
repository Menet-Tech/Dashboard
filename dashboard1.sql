-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 10 Apr 2026 pada 11.52
-- Versi server: 10.4.32-MariaDB
-- Versi PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `dashboard`
--

DELIMITER $$
--
-- Prosedur
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_generate_monthly_bills` (IN `target_periode` DATE)   BEGIN
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
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_soft_delete_pelanggan` (IN `pelanggan_id` INT)   BEGIN
    UPDATE pelanggan 
    SET deleted_at = NOW(), status = 'inactive'
    WHERE id = pelanggan_id;
    
    INSERT INTO action_log (id_pelanggan, tipe_aksi, status, pesan)
    VALUES (pelanggan_id, 'SOFT_DELETE', 'success', 'Pelanggan dihapus secara soft delete');
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Struktur dari tabel `action_log`
--

CREATE TABLE `action_log` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `id_pelanggan` int(10) UNSIGNED DEFAULT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `tipe_aksi` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL,
  `pesan` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log semua aksi sistem';

-- --------------------------------------------------------

--
-- Struktur dari tabel `backup_logs`
--

CREATE TABLE `backup_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `filename` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `status` enum('success','failed') NOT NULL DEFAULT 'success',
  `size_bytes` bigint(20) UNSIGNED DEFAULT NULL,
  `message` text DEFAULT NULL,
  `created_by_user_id` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `login_attempts`
--

CREATE TABLE `login_attempts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `username` varchar(50) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `attempted_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `migrations`
--

CREATE TABLE `migrations` (
  `id` int(10) UNSIGNED NOT NULL,
  `filename` varchar(191) NOT NULL,
  `executed_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `paket`
--

CREATE TABLE `paket` (
  `id` int(10) UNSIGNED NOT NULL,
  `nama_paket` varchar(50) NOT NULL,
  `harga` decimal(10,2) NOT NULL,
  `profile_mikrotik` varchar(50) NOT NULL DEFAULT 'default',
  `profile_limit_mikrotik` varchar(50) NOT NULL DEFAULT 'default-limit',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Paket layanan internet';

--
-- Dumping data untuk tabel `paket`
--

INSERT INTO `paket` (`id`, `nama_paket`, `harga`, `profile_mikrotik`, `profile_limit_mikrotik`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'Home 10Mbps', 150000.00, '10M-basic', '10M-limit', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(2, 'Home 20Mbps', 250000.00, '20M-standard', '20M-limit', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(3, 'Gamer 50Mbps', 450000.00, '50M-gamer', '50M-limit', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(4, 'Bisnis 100Mbps', 950000.00, '100M-business', '100M-limit', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48');

-- --------------------------------------------------------

--
-- Struktur dari tabel `payment_history`
--

CREATE TABLE `payment_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tagihan_id` int(10) UNSIGNED NOT NULL,
  `id_pelanggan` int(10) UNSIGNED NOT NULL,
  `metode_bayar` enum('cash','transfer','e_wallet','gateway','manual') NOT NULL DEFAULT 'manual',
  `jumlah_bayar` decimal(10,2) NOT NULL,
  `dibayar_pada` datetime NOT NULL DEFAULT current_timestamp(),
  `catatan` text DEFAULT NULL,
  `bukti_pembayaran` varchar(255) DEFAULT NULL,
  `created_by_user_id` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `pelanggan`
--

CREATE TABLE `pelanggan` (
  `id` int(10) UNSIGNED NOT NULL,
  `id_paket` int(10) UNSIGNED NOT NULL,
  `nama` varchar(100) NOT NULL,
  `user_pppoe` varchar(50) NOT NULL,
  `pass_pppoe` varchar(100) NOT NULL,
  `no_wa` varchar(20) NOT NULL,
  `sn_ont` varchar(50) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `alamat` text DEFAULT NULL,
  `tgl_jatuh_tempo` date NOT NULL COMMENT 'Tanggal jatuh tempo pembayaran tiap bulan',
  `status` enum('active','limit','inactive') NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL COMMENT 'Soft delete'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data pelanggan ISP';

--
-- Dumping data untuk tabel `pelanggan`
--

INSERT INTO `pelanggan` (`id`, `id_paket`, `nama`, `user_pppoe`, `pass_pppoe`, `no_wa`, `sn_ont`, `latitude`, `longitude`, `alamat`, `tgl_jatuh_tempo`, `status`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 'Budi Santoso', 'budi_pppoe', 'pass123', '6281234567890', 'SN123456', -6.20876340, 106.84559900, 'Jl. Sudirman No. 10, Jakarta', '2026-04-20', 'active', '2026-04-10 16:51:48', '2026-04-10 16:51:48', NULL),
(2, 2, 'Siti Aminah', 'siti_pppoe', 'pass456', '6289876543210', 'SN789012', -6.22938670, 106.82432650, 'Jl. Thamrin No. 25, Jakarta', '2026-04-15', 'active', '2026-04-10 16:51:48', '2026-04-10 16:51:48', NULL),
(3, 3, 'Agus Prasetyo', 'agus_pppoe', 'pass789', '6281112223334', 'SN345678', -7.25747190, 112.75208830, 'Jl. Ahmad Yani No. 5, Surabaya', '2026-04-03', 'limit', '2026-04-10 16:51:48', '2026-04-10 16:51:48', NULL);

-- --------------------------------------------------------

--
-- Struktur dari tabel `pengaturan`
--

CREATE TABLE `pengaturan` (
  `key` varchar(50) NOT NULL,
  `value` text NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Konfigurasi sistem';

--
-- Dumping data untuk tabel `pengaturan`
--

INSERT INTO `pengaturan` (`key`, `value`, `description`, `updated_at`) VALUES
('alamat_isp', 'Jl. Teknologi No. 123, Jakarta', 'Alamat kantor', '2026-04-10 16:51:48'),
('backup_retention_days', '14', 'Retensi backup otomatis dalam hari', '2026-04-10 16:51:48'),
('billing_auto_generate_day', '1', 'Hari generate tagihan otomatis setiap bulan', '2026-04-10 16:51:48'),
('billing_auto_generate_enabled', 'true', 'Aktifkan generate tagihan otomatis bulanan', '2026-04-10 16:51:48'),
('billing_auto_generate_time', '00:05', 'Jam generate tagihan otomatis setiap bulan', '2026-04-10 16:51:48'),
('cron_last_run_at', '', 'Waktu terakhir scheduler berjalan', '2026-04-10 16:51:48'),
('cron_last_status', '', 'Status terakhir scheduler', '2026-04-10 16:51:48'),
('discord_alert_url', '', 'Webhook URL Discord untuk alert sistem', '2026-04-10 16:51:48'),
('discord_billing_url', '', 'Webhook URL Discord untuk notifikasi billing', '2026-04-10 16:51:48'),
('discord_bot_status_last_check', '', 'Status cache bot Discord terakhir', '2026-04-10 16:51:48'),
('login_rate_limit_max_attempts', '5', 'Maksimal percobaan login per 15 menit', '2026-04-10 16:51:48'),
('login_rate_limit_window_minutes', '15', 'Jendela rate limit login dalam menit', '2026-04-10 16:51:48'),
('mikrotik_host', '192.168.88.1', 'IP Address Router MikroTik', '2026-04-10 16:51:48'),
('mikrotik_pass', '', 'Password API MikroTik', '2026-04-10 16:51:48'),
('mikrotik_status_last_check', '', 'Status cache MikroTik terakhir', '2026-04-10 16:51:48'),
('mikrotik_user', 'api', 'Username API MikroTik', '2026-04-10 16:51:48'),
('nama_isp', 'NetGuard ISP', 'Nama ISP yang ditampilkan di header', '2026-04-10 16:51:48'),
('no_rekening', '1234567890 (BCA a.n. PT NetGuard)', 'Informasi rekening untuk pembayaran', '2026-04-10 16:51:48'),
('snap_is_production', 'false', 'Mode production Midtrans (true/false)', '2026-04-10 16:51:48'),
('snap_midtrans_client_key', '', 'Midtrans Client Key', '2026-04-10 16:51:48'),
('snap_midtrans_server_key', '', 'Midtrans Server Key', '2026-04-10 16:51:48'),
('wa_status_panel_last_check', '', 'Status cache panel WA terakhir', '2026-04-10 16:51:48'),
('whatsapp_api_key', '', 'API Key jika menggunakan gateway berbayar', '2026-04-10 16:51:48'),
('whatsapp_gateway_url', 'https://api.whatsapp.com/send', 'URL endpoint gateway WhatsApp', '2026-04-10 16:51:48');

--
-- Trigger `pengaturan`
--
DELIMITER $$
CREATE TRIGGER `trg_pengaturan_before_update` BEFORE UPDATE ON `pengaturan` FOR EACH ROW BEGIN
    SET NEW.updated_at = NOW();
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Struktur dari tabel `system_health_checks`
--

CREATE TABLE `system_health_checks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `service_name` varchar(50) NOT NULL,
  `status` enum('ok','warning','failed') NOT NULL DEFAULT 'ok',
  `message` text DEFAULT NULL,
  `checked_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `tagihan`
--

CREATE TABLE `tagihan` (
  `id` int(10) UNSIGNED NOT NULL,
  `id_pelanggan` int(10) UNSIGNED NOT NULL,
  `periode` date NOT NULL COMMENT 'Bulan tagihan (format: YYYY-MM-01)',
  `tgl_tagihan` datetime NOT NULL DEFAULT current_timestamp(),
  `tgl_bayar` datetime DEFAULT NULL,
  `harga` decimal(10,2) NOT NULL,
  `status` enum('belum_bayar','menunggu_wa','lunas') NOT NULL DEFAULT 'belum_bayar',
  `metode_bayar` enum('cash','transfer','e_wallet','gateway','manual') DEFAULT NULL,
  `catatan_pembayaran` text DEFAULT NULL,
  `bukti_pembayaran` varchar(255) DEFAULT NULL,
  `paid_by_user_id` int(10) UNSIGNED DEFAULT NULL,
  `updated_by_user_id` int(10) UNSIGNED DEFAULT NULL,
  `snap_token` varchar(64) DEFAULT NULL,
  `redo_expired_at` datetime DEFAULT NULL COMMENT 'Batas waktu tombol Redo (3 jam setelah klik Lunas)',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data tagihan bulanan';

--
-- Dumping data untuk tabel `tagihan`
--

INSERT INTO `tagihan` (`id`, `id_pelanggan`, `periode`, `tgl_tagihan`, `tgl_bayar`, `harga`, `status`, `metode_bayar`, `catatan_pembayaran`, `bukti_pembayaran`, `paid_by_user_id`, `updated_by_user_id`, `snap_token`, `redo_expired_at`, `created_at`, `updated_at`) VALUES
(1, 1, '2026-04-01', '2026-04-10 16:51:48', NULL, 150000.00, 'belum_bayar', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(2, 2, '2026-04-01', '2026-04-10 16:51:48', NULL, 250000.00, 'menunggu_wa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(3, 3, '2026-03-01', '2026-03-10 16:51:48', NULL, 450000.00, 'lunas', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(4, 3, '2026-04-01', '2026-04-10 16:51:48', NULL, 450000.00, 'belum_bayar', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-10 16:51:48', '2026-04-10 16:51:48');

-- --------------------------------------------------------

--
-- Struktur dari tabel `template_wa`
--

CREATE TABLE `template_wa` (
  `id` int(10) UNSIGNED NOT NULL,
  `nama` varchar(50) NOT NULL,
  `isi_pesan` text NOT NULL,
  `trigger_event` enum('lunas','jatuh_tempo','reminder_7hari') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Template pesan WhatsApp';

--
-- Dumping data untuk tabel `template_wa`
--

INSERT INTO `template_wa` (`id`, `nama`, `isi_pesan`, `trigger_event`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'Pembayaran Lunas', 'Halo {nama},\n\nPembayaran tagihan internet periode {periode} sebesar Rp {harga} telah kami terima. Layanan Anda akan tetap aktif.\n\nTerima kasih.\n- {nama_isp}', 'lunas', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(2, 'Jatuh Tempo Hari Ini', 'Halo {nama},\n\nTagihan internet Anda sebesar Rp {harga} untuk periode {periode} jatuh tempo hari ini. Segera lakukan pembayaran agar layanan tidak terganggu.\n\nRekening: {no_rekening}\n\n- {nama_isp}', 'jatuh_tempo', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48'),
(3, 'Reminder 7 Hari', 'Halo {nama},\n\nMengingatkan bahwa tagihan internet Anda sebesar Rp {harga} akan jatuh tempo dalam 7 hari ({tgl_jatuh_tempo}). Mohon siapkan pembayaran.\n\nTerima kasih.\n- {nama_isp}', 'reminder_7hari', 1, '2026-04-10 16:51:48', '2026-04-10 16:51:48');

-- --------------------------------------------------------

--
-- Struktur dari tabel `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `nama_lengkap` varchar(100) NOT NULL,
  `role` enum('admin','petugas') NOT NULL DEFAULT 'petugas',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_login` datetime DEFAULT NULL,
  `password_updated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Akun petugas/admin';

--
-- Dumping data untuk tabel `users`
--

INSERT INTO `users` (`id`, `username`, `password_hash`, `nama_lengkap`, `role`, `is_active`, `last_login`, `password_updated_at`, `created_at`, `updated_at`) VALUES
(1, 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin', 1, NULL, NULL, '2026-04-10 16:51:48', '2026-04-10 16:51:48');

-- --------------------------------------------------------

--
-- Struktur dari tabel `user_sessions`
--

CREATE TABLE `user_sessions` (
  `id` varchar(128) NOT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) NOT NULL,
  `user_agent` text NOT NULL,
  `payload` text NOT NULL,
  `last_activity` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Stand-in struktur untuk tampilan `view_jatuh_tempo_hari_ini`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `view_jatuh_tempo_hari_ini` (
`id` int(10) unsigned
,`nama` varchar(100)
,`user_pppoe` varchar(50)
,`no_wa` varchar(20)
,`nama_paket` varchar(50)
,`id_tagihan` int(10) unsigned
,`periode` date
,`harga` decimal(10,2)
,`status` enum('belum_bayar','menunggu_wa','lunas')
);

-- --------------------------------------------------------

--
-- Stand-in struktur untuk tampilan `view_pelanggan_summary`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `view_pelanggan_summary` (
`total_pelanggan` bigint(21)
,`total_active` decimal(22,0)
,`total_limit` decimal(22,0)
,`total_inactive` decimal(22,0)
,`total_non_deleted` decimal(22,0)
);

-- --------------------------------------------------------

--
-- Stand-in struktur untuk tampilan `view_pelanggan_tagihan_terakhir`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `view_pelanggan_tagihan_terakhir` (
`id` int(10) unsigned
,`nama` varchar(100)
,`user_pppoe` varchar(50)
,`status_pelanggan` enum('active','limit','inactive')
,`tgl_jatuh_tempo` date
,`no_wa` varchar(20)
,`nama_paket` varchar(50)
,`harga` decimal(10,2)
,`id_tagihan_terakhir` int(10) unsigned
,`periode_tagihan` date
,`status_tagihan` enum('belum_bayar','menunggu_wa','lunas')
,`tgl_bayar` datetime
,`hari_tunggakan` int(7)
);

-- --------------------------------------------------------

--
-- Stand-in struktur untuk tampilan `view_pendapatan_bulanan`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `view_pendapatan_bulanan` (
`bulan` varchar(7)
,`total_tagihan` bigint(21)
,`pendapatan_terkumpul` decimal(32,2)
,`potensi_pendapatan` decimal(32,2)
);

-- --------------------------------------------------------

--
-- Struktur untuk view `view_jatuh_tempo_hari_ini`
--
DROP TABLE IF EXISTS `view_jatuh_tempo_hari_ini`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_jatuh_tempo_hari_ini`  AS SELECT `p`.`id` AS `id`, `p`.`nama` AS `nama`, `p`.`user_pppoe` AS `user_pppoe`, `p`.`no_wa` AS `no_wa`, `pk`.`nama_paket` AS `nama_paket`, `t`.`id` AS `id_tagihan`, `t`.`periode` AS `periode`, `t`.`harga` AS `harga`, `t`.`status` AS `status` FROM ((`pelanggan` `p` join `paket` `pk` on(`p`.`id_paket` = `pk`.`id`)) left join `tagihan` `t` on(`p`.`id` = `t`.`id_pelanggan` and `t`.`periode` = date_format(curdate(),'%Y-%m-01'))) WHERE `p`.`status` = 'active' AND `p`.`deleted_at` is null AND `p`.`tgl_jatuh_tempo` = curdate() ;

-- --------------------------------------------------------

--
-- Struktur untuk view `view_pelanggan_summary`
--
DROP TABLE IF EXISTS `view_pelanggan_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_pelanggan_summary`  AS SELECT count(0) AS `total_pelanggan`, sum(case when `pelanggan`.`status` = 'active' then 1 else 0 end) AS `total_active`, sum(case when `pelanggan`.`status` = 'limit' then 1 else 0 end) AS `total_limit`, sum(case when `pelanggan`.`status` = 'inactive' then 1 else 0 end) AS `total_inactive`, sum(case when `pelanggan`.`deleted_at` is null then 1 else 0 end) AS `total_non_deleted` FROM `pelanggan` ;

-- --------------------------------------------------------

--
-- Struktur untuk view `view_pelanggan_tagihan_terakhir`
--
DROP TABLE IF EXISTS `view_pelanggan_tagihan_terakhir`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_pelanggan_tagihan_terakhir`  AS SELECT `p`.`id` AS `id`, `p`.`nama` AS `nama`, `p`.`user_pppoe` AS `user_pppoe`, `p`.`status` AS `status_pelanggan`, `p`.`tgl_jatuh_tempo` AS `tgl_jatuh_tempo`, `p`.`no_wa` AS `no_wa`, `pk`.`nama_paket` AS `nama_paket`, `pk`.`harga` AS `harga`, `t`.`id` AS `id_tagihan_terakhir`, `t`.`periode` AS `periode_tagihan`, `t`.`status` AS `status_tagihan`, `t`.`tgl_bayar` AS `tgl_bayar`, to_days(curdate()) - to_days(`p`.`tgl_jatuh_tempo`) AS `hari_tunggakan` FROM ((`pelanggan` `p` join `paket` `pk` on(`p`.`id_paket` = `pk`.`id`)) left join (select `t1`.`id` AS `id`,`t1`.`id_pelanggan` AS `id_pelanggan`,`t1`.`periode` AS `periode`,`t1`.`tgl_tagihan` AS `tgl_tagihan`,`t1`.`tgl_bayar` AS `tgl_bayar`,`t1`.`harga` AS `harga`,`t1`.`status` AS `status`,`t1`.`snap_token` AS `snap_token`,`t1`.`redo_expired_at` AS `redo_expired_at`,`t1`.`created_at` AS `created_at`,`t1`.`updated_at` AS `updated_at` from (`tagihan` `t1` join (select `tagihan`.`id_pelanggan` AS `id_pelanggan`,max(`tagihan`.`periode`) AS `max_periode` from `tagihan` group by `tagihan`.`id_pelanggan`) `t2` on(`t1`.`id_pelanggan` = `t2`.`id_pelanggan` and `t1`.`periode` = `t2`.`max_periode`))) `t` on(`p`.`id` = `t`.`id_pelanggan`)) WHERE `p`.`deleted_at` is null ;

-- --------------------------------------------------------

--
-- Struktur untuk view `view_pendapatan_bulanan`
--
DROP TABLE IF EXISTS `view_pendapatan_bulanan`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_pendapatan_bulanan`  AS SELECT date_format(`tagihan`.`periode`,'%Y-%m') AS `bulan`, count(0) AS `total_tagihan`, sum(case when `tagihan`.`status` = 'lunas' then `tagihan`.`harga` else 0 end) AS `pendapatan_terkumpul`, sum(`tagihan`.`harga`) AS `potensi_pendapatan` FROM `tagihan` GROUP BY date_format(`tagihan`.`periode`,'%Y-%m') ORDER BY date_format(`tagihan`.`periode`,'%Y-%m') DESC ;

--
-- Indexes for dumped tables
--

--
-- Indeks untuk tabel `action_log`
--
ALTER TABLE `action_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_id_pelanggan` (`id_pelanggan`),
  ADD KEY `idx_tipe_aksi` (`tipe_aksi`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `fk_action_log_user` (`user_id`);

--
-- Indeks untuk tabel `backup_logs`
--
ALTER TABLE `backup_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_created_by_user_id` (`created_by_user_id`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- Indeks untuk tabel `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_username_attempted_at` (`username`,`attempted_at`),
  ADD KEY `idx_ip_attempted_at` (`ip_address`,`attempted_at`);

--
-- Indeks untuk tabel `migrations`
--
ALTER TABLE `migrations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_filename` (`filename`);

--
-- Indeks untuk tabel `paket`
--
ALTER TABLE `paket`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_nama_paket` (`nama_paket`);

--
-- Indeks untuk tabel `payment_history`
--
ALTER TABLE `payment_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tagihan_id` (`tagihan_id`),
  ADD KEY `idx_id_pelanggan` (`id_pelanggan`),
  ADD KEY `idx_created_by_user_id` (`created_by_user_id`);

--
-- Indeks untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_user_pppoe` (`user_pppoe`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_tgl_jatuh_tempo` (`tgl_jatuh_tempo`),
  ADD KEY `idx_deleted_at` (`deleted_at`),
  ADD KEY `fk_pelanggan_paket` (`id_paket`);
ALTER TABLE `pelanggan` ADD FULLTEXT KEY `ft_nama_alamat` (`nama`,`alamat`);

--
-- Indeks untuk tabel `pengaturan`
--
ALTER TABLE `pengaturan`
  ADD PRIMARY KEY (`key`);

--
-- Indeks untuk tabel `system_health_checks`
--
ALTER TABLE `system_health_checks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_service_name_checked_at` (`service_name`,`checked_at`);

--
-- Indeks untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_snap_token` (`snap_token`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_periode` (`periode`),
  ADD KEY `idx_redo_expired` (`redo_expired_at`),
  ADD KEY `idx_redo_expired_status` (`redo_expired_at`,`status`),
  ADD KEY `idx_id_pelanggan_periode` (`id_pelanggan`,`periode`),
  ADD KEY `fk_tagihan_paid_by_user` (`paid_by_user_id`),
  ADD KEY `fk_tagihan_updated_by_user` (`updated_by_user_id`);

--
-- Indeks untuk tabel `template_wa`
--
ALTER TABLE `template_wa`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_trigger_event` (`trigger_event`),
  ADD KEY `idx_nama` (`nama`);

--
-- Indeks untuk tabel `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_username` (`username`);

--
-- Indeks untuk tabel `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_last_activity` (`last_activity`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `action_log`
--
ALTER TABLE `action_log`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `backup_logs`
--
ALTER TABLE `backup_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `login_attempts`
--
ALTER TABLE `login_attempts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `migrations`
--
ALTER TABLE `migrations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `paket`
--
ALTER TABLE `paket`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT untuk tabel `payment_history`
--
ALTER TABLE `payment_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT untuk tabel `system_health_checks`
--
ALTER TABLE `system_health_checks`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT untuk tabel `template_wa`
--
ALTER TABLE `template_wa`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT untuk tabel `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Ketidakleluasaan untuk tabel pelimpahan (Dumped Tables)
--

--
-- Ketidakleluasaan untuk tabel `action_log`
--
ALTER TABLE `action_log`
  ADD CONSTRAINT `fk_action_log_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_action_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `backup_logs`
--
ALTER TABLE `backup_logs`
  ADD CONSTRAINT `fk_backup_logs_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `payment_history`
--
ALTER TABLE `payment_history`
  ADD CONSTRAINT `fk_payment_history_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payment_history_tagihan` FOREIGN KEY (`tagihan_id`) REFERENCES `tagihan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payment_history_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  ADD CONSTRAINT `fk_pelanggan_paket` FOREIGN KEY (`id_paket`) REFERENCES `paket` (`id`) ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  ADD CONSTRAINT `fk_tagihan_paid_by_user` FOREIGN KEY (`paid_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tagihan_pelanggan` FOREIGN KEY (`id_pelanggan`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tagihan_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

DELIMITER $$
--
-- Event
--
CREATE DEFINER=`root`@`localhost` EVENT `ev_generate_tagihan_bulanan` ON SCHEDULE EVERY 1 MONTH STARTS '2026-04-01 00:05:00' ON COMPLETION PRESERVE ENABLE COMMENT 'Generate tagihan untuk semua pelanggan aktif setiap awal bulan' DO CALL sp_generate_monthly_bills(DATE_FORMAT(CURDATE(), '%Y-%m-01'))$$

DELIMITER ;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
