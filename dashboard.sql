-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 02 Mar 2026 pada 13.42
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
(90, '10MB/s', '192.168.10.1', '192.168.10.253', '192.168.10.254', '2026-03-02 09:42:31', '2026-03-02 12:35:38'),
(91, '20MB/s', '192.168.20.1', '192.168.20.253', '192.168.20.254', '2026-03-02 09:42:53', '2026-03-02 10:35:01'),
(92, '30MB/s', '192.168.30.1', '192.168.30.253', '192.168.30.254', '2026-03-02 09:43:07', '2026-03-02 10:34:48'),
(94, '50 Mbps', '192.168.50.1', '192.168.50.100', '192.168.50.254', '2026-03-02 10:28:03', '2026-03-02 12:11:29');

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
(27, 'Paket 10 Mbps', 90, 90, '10M/10M', 0, '2026-03-02 09:46:40', '2026-03-02 12:35:38'),
(28, 'Paket 20 Mbps', 91, 91, '20M/20M', 0, '2026-03-02 09:46:59', '2026-03-02 09:46:59'),
(29, 'Paket 30 Mbps', 92, 92, '50M/50M', 0, '2026-03-02 09:47:12', '2026-03-02 09:47:12'),
(30, 'Paket 10 Mbps1', 90, 90, '50M/50M', 0, '2026-03-02 10:36:01', '2026-03-02 12:21:08'),
(32, 'Paket 50 Mbps', 94, 94, '50M/50M', 0, '2026-03-02 12:11:11', '2026-03-02 12:11:11'),
(33, 'Paket 10 Mbps2', 90, 90, '10M/10M', 0, '2026-03-02 12:22:08', '2026-03-02 12:22:08');

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
