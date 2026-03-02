-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 02 Mar 2026 pada 10.54
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `ip_pools`
--

INSERT INTO `ip_pools` (`id`, `name`, `start_ip`, `end_ip`, `created_at`, `updated_at`) VALUES
(90, '10MB/s1', '192.168.10.1', '192.168.10.253', '2026-03-02 09:42:31', '2026-03-02 09:50:51'),
(91, '20MB/s', '192.168.20.1', '192.168.20.253', '2026-03-02 09:42:53', '2026-03-02 09:45:20'),
(92, '30MB/s', '192.168.30.1', '192.168.30.253', '2026-03-02 09:43:07', '2026-03-02 09:45:37');

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
  `local_address` varchar(15) NOT NULL,
  `remote_address` varchar(100) NOT NULL,
  `speed_limit` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `paket_bandwidth`
--

INSERT INTO `paket_bandwidth` (`id`, `name`, `local_address`, `remote_address`, `speed_limit`, `created_at`, `updated_at`) VALUES
(27, 'Paket 10 Mbps', '192.168.10.254', '10MB/s', '10M/10M', '2026-03-02 09:46:40', '2026-03-02 09:47:39'),
(28, 'Paket 20 Mbps', '192.168.20.254', '20MB/s', '20M/20M', '2026-03-02 09:46:59', '2026-03-02 09:46:59'),
(29, 'Paket 30 Mbps', '192.168.30.254', '30MB/s', '50M/50M', '2026-03-02 09:47:12', '2026-03-02 09:47:12');

--
-- Trigger `paket_bandwidth`
--
DELIMITER $$
CREATE TRIGGER `update_paket_timestamp` BEFORE UPDATE ON `paket_bandwidth` FOR EACH ROW BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `validate_paket_ip_format` BEFORE INSERT ON `paket_bandwidth` FOR EACH ROW BEGIN
    IF NOT NEW.local_address REGEXP '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Format Local Address tidak valid';
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
  ADD KEY `idx_local_address` (`local_address`),
  ADD KEY `idx_remote_address` (`remote_address`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `ip_pools`
--
ALTER TABLE `ip_pools`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=93;

--
-- AUTO_INCREMENT untuk tabel `paket_bandwidth`
--
ALTER TABLE `paket_bandwidth`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=30;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
