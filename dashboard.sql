-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 28 Feb 2026 pada 15.10
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
(4, 'pool-wifi-1', '172.16.1.50', '172.16.1.100', '2026-02-28 12:21:57', '2026-02-28 12:21:57'),
(6, 'test', '172.16.1.50', '172.16.1.100', '2026-02-28 12:21:57', '2026-02-28 12:21:57'),
(7, 'zx', '172.16.1.1', '172.16.1.100', '2026-02-28 13:58:21', '2026-02-28 13:58:21'),
(8, 'coba 1', '192.168.10.1', '192.168.10.100', '2026-02-28 13:58:50', '2026-02-28 13:58:50'),
(9, '1', '172.16.1.1', '172.16.1.50', '2026-02-28 14:06:17', '2026-02-28 14:06:17');

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
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `ip_pools`
--
ALTER TABLE `ip_pools`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
