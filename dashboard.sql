-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 10 Mar 2026 pada 09.08
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

-- --------------------------------------------------------

--
-- Struktur dari tabel `ip_pools`
--

CREATE TABLE `ip_pools` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `start_ip` varchar(15) NOT NULL,
  `end_ip` varchar(15) NOT NULL,
  `gateway` varchar(15) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `ip_pools`
--

INSERT INTO `ip_pools` (`id`, `name`, `start_ip`, `end_ip`, `gateway`, `created_at`, `updated_at`) VALUES
(90, '10MBps', '192.168.10.1', '192.168.10.253', '192.168.10.254', '2026-03-02 09:42:31', '2026-03-09 13:30:38'),
(91, '20MBps', '192.168.20.1', '192.168.20.253', '192.168.20.254', '2026-03-02 09:42:53', '2026-03-09 13:30:46'),
(92, '30MBps', '192.168.30.1', '192.168.30.253', '192.168.30.254', '2026-03-02 09:43:07', '2026-03-09 13:30:54'),
(94, '50Mbps', '192.168.50.1', '192.168.50.100', '192.168.50.254', '2026-03-02 10:28:03', '2026-03-09 13:31:07');

--
-- Trigger `ip_pools`
--
DELIMITER $$
CREATE TRIGGER `update_ip_pool_timestamp` BEFORE UPDATE ON `ip_pools` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `validate_ip_format` BEFORE INSERT ON `ip_pools` FOR EACH ROW BEGIN
    -- Validasi format IP address
    IF NOT NEW.start_ip REGEXP '^([0-9]{1,3}.){3}[0-9]{1,3}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Format Start IP tidak valid';
    END IF;
    
    IF NOT NEW.end_ip REGEXP '^([0-9]{1,3}.){3}[0-9]{1,3}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Format End IP tidak valid';
    END IF;
    
    -- Validasi range IP (start IP harus lebih kecil dari end IP)
    IF INET_ATON(NEW.start_ip) >= INET_ATON(NEW.end_ip) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start IP harus lebih kecil dari End IP';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Struktur dari tabel `paket_bandwidth`
--

CREATE TABLE `paket_bandwidth` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `id_local_address` int(11) NOT NULL,
  `id_remote_address` int(11) NOT NULL,
  `speed_limit` varchar(50) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `paket_bandwidth`
--

INSERT INTO `paket_bandwidth` (`id`, `name`, `id_local_address`, `id_remote_address`, `speed_limit`, `price`, `created_at`, `updated_at`) VALUES
(27, 'Paket 10 Mbps', 90, 90, '10M/10M', 99000, '2026-03-02 09:46:40', '2026-03-04 17:46:13'),
(28, 'Paket 20 Mbps', 91, 91, '20M/20M', 130000, '2026-03-02 09:46:59', '2026-03-09 13:19:11'),
(29, 'Paket 30 Mbps', 92, 92, '30M/30M', 180000, '2026-03-02 09:47:12', '2026-03-09 13:19:30'),
(32, 'Paket 50 Mbps', 94, 94, '50M/50M', 250000, '2026-03-02 12:11:11', '2026-03-09 13:19:41');

--
-- Trigger `paket_bandwidth`
--
DELIMITER $$
CREATE TRIGGER `update_paket_timestamp` BEFORE UPDATE ON `paket_bandwidth` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Validasi harga harus lebih dari 0 saat update
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Harga harus lebih dari 0';
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `validate_paket_id_format` BEFORE INSERT ON `paket_bandwidth` FOR EACH ROW BEGIN
    -- Validasi bahwa id_local_address dan id_remote_address adalah integer positif
    IF NEW.id_local_address <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Local Address harus lebih besar dari 0';
    END IF;
    
    IF NEW.id_remote_address <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Remote Address harus lebih besar dari 0';
    END IF;
    
    -- Validasi bahwa ID yang dimasukkan ada di tabel ip_pools
    IF NOT EXISTS (SELECT 1 FROM ip_pools WHERE id = NEW.id_local_address) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Local Address tidak ditemukan di tabel ip_pools';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM ip_pools WHERE id = NEW.id_remote_address) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ID Remote Address tidak ditemukan di tabel ip_pools';
    END IF;
    
    -- Validasi harga harus lebih dari 0
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Harga harus lebih dari 0';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Struktur dari tabel `pelanggan`
--

CREATE TABLE `pelanggan` (
  `id` int(11) NOT NULL,
  `nama` varchar(100) NOT NULL,
  `user_pppoe` varchar(50) NOT NULL,
  `password_pppoe` varchar(100) NOT NULL,
  `paket_id` int(11) NOT NULL,
  `jatuh_tempo` int(2) NOT NULL,
  `harga` int(11) NOT NULL DEFAULT 0,
  `status` enum('active','limit','tertunda','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `pelanggan`
--

INSERT INTO `pelanggan` (`id`, `nama`, `user_pppoe`, `password_pppoe`, `paket_id`, `jatuh_tempo`, `harga`, `status`, `created_at`, `updated_at`) VALUES
(2, 'elam', 'elam', '12345', 32, 7, 250000, 'active', '2026-03-09 14:09:31', '2026-03-09 20:47:42'),
(3, 'Irfan Dharmawan', 'irfan', '12345', 32, 2, 250000, 'inactive', '2026-03-09 14:15:07', '2026-03-09 21:01:57'),
(5, 'Mursidahi', 'mur', '12345', 28, 9, 130000, 'inactive', '2026-03-09 14:38:31', '2026-03-09 15:04:09'),
(6, 'test', 'admin', '12345', 28, 12, 130000, 'active', '2026-03-09 14:42:55', '2026-03-09 20:41:41'),
(7, 'asd', 'admin45', '12345', 28, 3, 130000, 'tertunda', '2026-03-09 14:49:05', '2026-03-09 15:03:50'),
(8, '1213qwe', 'qweas', '12345', 28, 3, 130000, 'tertunda', '2026-03-09 14:54:45', '2026-03-09 15:03:46');

--
-- Trigger `pelanggan`
--
DELIMITER $$
CREATE TRIGGER `update_pelanggan_timestamp` BEFORE UPDATE ON `pelanggan` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Validasi jatuh tempo harus antara 1-31 saat update
    IF NEW.jatuh_tempo < 1 OR NEW.jatuh_tempo > 31 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jatuh tempo harus antara 1-31';
    END IF;
    
    -- Validasi paket_id harus ada di tabel paket_bandwidth saat update
    IF NOT EXISTS (SELECT 1 FROM paket_bandwidth WHERE id = NEW.paket_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paket ID tidak ditemukan di tabel paket_bandwidth';
    END IF;
    
    -- Update harga sesuai dengan harga di paket_bandwidth
    SET NEW.harga = (SELECT price FROM paket_bandwidth WHERE id = NEW.paket_id);
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `validate_pelanggan_data` BEFORE INSERT ON `pelanggan` FOR EACH ROW BEGIN
    -- Validasi jatuh tempo harus antara 1-31
    IF NEW.jatuh_tempo < 1 OR NEW.jatuh_tempo > 31 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jatuh tempo harus antara 1-31';
    END IF;
    
    -- Validasi paket_id harus ada di tabel paket_bandwidth
    IF NOT EXISTS (SELECT 1 FROM paket_bandwidth WHERE id = NEW.paket_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paket ID tidak ditemukan di tabel paket_bandwidth';
    END IF;
    
    -- Ambil harga dari paket_bandwidth dan set ke harga pelanggan
    SET NEW.harga = (SELECT price FROM paket_bandwidth WHERE id = NEW.paket_id);
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Struktur dari tabel `tagihan`
--

CREATE TABLE `tagihan` (
  `id` int(11) NOT NULL,
  `pelanggan_id` int(11) NOT NULL,
  `tanggal_tagihan` date NOT NULL,
  `tanggal_jatuh_tempo` date NOT NULL,
  `status_bayar` enum('belum','sudah') DEFAULT 'belum',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `tagihan`
--

INSERT INTO `tagihan` (`id`, `pelanggan_id`, `tanggal_tagihan`, `tanggal_jatuh_tempo`, `status_bayar`, `created_at`, `updated_at`) VALUES
(11, 2, '2026-03-04', '2026-03-07', 'belum', '2026-03-09 20:59:54', '2026-03-09 20:59:54'),
(12, 6, '2026-03-09', '2026-03-12', 'belum', '2026-03-09 20:59:54', '2026-03-09 20:59:54'),
(13, 3, '2026-02-27', '2026-03-02', 'belum', '2026-03-09 21:01:57', '2026-03-09 21:01:57');

--
-- Trigger `tagihan`
--
DELIMITER $$
CREATE TRIGGER `update_tagihan_timestamp` BEFORE UPDATE ON `tagihan` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `validate_tagihan_dates` BEFORE INSERT ON `tagihan` FOR EACH ROW BEGIN
    -- Validasi tanggal jatuh tempo harus lebih besar dari tanggal tagihan
    IF NEW.tanggal_jatuh_tempo <= NEW.tanggal_tagihan THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tanggal jatuh tempo harus lebih besar dari tanggal tagihan';
    END IF;
END
$$
DELIMITER ;

--
-- Indexes for dumped tables
--

--
-- Indeks untuk tabel `ip_pools`
--
ALTER TABLE `ip_pools`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `idx_name` (`name`),
  ADD KEY `idx_start_ip` (`start_ip`),
  ADD KEY `idx_end_ip` (`end_ip`);

--
-- Indeks untuk tabel `paket_bandwidth`
--
ALTER TABLE `paket_bandwidth`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `idx_name` (`name`),
  ADD KEY `idx_id_local_address` (`id_local_address`),
  ADD KEY `idx_id_remote_address` (`id_remote_address`);

--
-- Indeks untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_pppoe` (`user_pppoe`),
  ADD KEY `idx_nama` (`nama`),
  ADD KEY `idx_user_pppoe` (`user_pppoe`),
  ADD KEY `idx_paket_id` (`paket_id`),
  ADD KEY `idx_jatuh_tempo` (`jatuh_tempo`),
  ADD KEY `idx_status` (`status`);

--
-- Indeks untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pelanggan_id` (`pelanggan_id`),
  ADD KEY `idx_tanggal_tagihan` (`tanggal_tagihan`),
  ADD KEY `idx_tanggal_jatuh_tempo` (`tanggal_jatuh_tempo`),
  ADD KEY `idx_status_bayar` (`status_bayar`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `ip_pools`
--
ALTER TABLE `ip_pools`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=98;

--
-- AUTO_INCREMENT untuk tabel `paket_bandwidth`
--
ALTER TABLE `paket_bandwidth`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

--
-- AUTO_INCREMENT untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- Ketidakleluasaan untuk tabel pelimpahan (Dumped Tables)
--

--
-- Ketidakleluasaan untuk tabel `pelanggan`
--
ALTER TABLE `pelanggan`
  ADD CONSTRAINT `fk_paket_id` FOREIGN KEY (`paket_id`) REFERENCES `paket_bandwidth` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tagihan`
--
ALTER TABLE `tagihan`
  ADD CONSTRAINT `fk_tagihan_pelanggan_id` FOREIGN KEY (`pelanggan_id`) REFERENCES `pelanggan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
