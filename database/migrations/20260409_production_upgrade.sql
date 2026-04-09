CREATE TABLE IF NOT EXISTS `migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename` VARCHAR(191) NOT NULL,
  `executed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `tagihan`
  ADD COLUMN IF NOT EXISTS `metode_bayar` ENUM('cash','transfer','e_wallet','gateway','manual') NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `catatan_pembayaran` TEXT NULL AFTER `metode_bayar`,
  ADD COLUMN IF NOT EXISTS `bukti_pembayaran` VARCHAR(255) NULL AFTER `catatan_pembayaran`,
  ADD COLUMN IF NOT EXISTS `paid_by_user_id` INT UNSIGNED NULL AFTER `bukti_pembayaran`,
  ADD COLUMN IF NOT EXISTS `updated_by_user_id` INT UNSIGNED NULL AFTER `paid_by_user_id`,
  ADD CONSTRAINT `fk_tagihan_paid_by_user` FOREIGN KEY (`paid_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tagihan_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `payment_history` (
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

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_username_attempted_at` (`username`, `attempted_at`),
  KEY `idx_ip_attempted_at` (`ip_address`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_health_checks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_name` VARCHAR(50) NOT NULL,
  `status` ENUM('ok','warning','failed') NOT NULL DEFAULT 'ok',
  `message` TEXT NULL,
  `checked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_service_name_checked_at` (`service_name`, `checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backup_logs` (
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

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `password_updated_at` DATETIME NULL AFTER `last_login`;

ALTER TABLE `action_log`
  ADD COLUMN IF NOT EXISTS `user_id` INT UNSIGNED NULL AFTER `id_pelanggan`,
  ADD CONSTRAINT `fk_action_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `pengaturan` (`key`, `value`, `description`) VALUES
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
('mikrotik_status_last_check', '', 'Status cache MikroTik terakhir')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `description` = VALUES(`description`);
