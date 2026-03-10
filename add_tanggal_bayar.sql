-- ========================================
-- SQL untuk menambah field tanggal_bayar
-- ========================================
-- 
-- Tujuan: Menyimpan tanggal pembayaran untuk menghitung apakah telat atau lebih dulu
-- 
-- Cara menjalankan:
-- 1. Buka phpMyAdmin di http://localhost/phpmyadmin
-- 2. Pilih database "dashboard"
-- 3. Klik tab "SQL"
-- 4. Copy-paste query di bawah ini
-- 5. Klik "Go" atau "Execute"
-- 
-- ========================================

ALTER TABLE `tagihan` ADD COLUMN `tanggal_bayar` date NULL AFTER `status_bayar`;

-- ========================================
-- Query selesai!
-- ========================================
-- 
-- Perbedaan:
-- - tanggal_bayar NULL = Belum ada pembayaran
-- - tanggal_bayar filled = Sudah ada pembayaran (info telat/lebih dulu akan ditampilkan)
--
-- ========================================
