<?php
/**
 * build_wa.php
 * Endpoint untuk memproses data tagihan dan mengalihkan user ke link wa.me
 * Parameter: id (tagihan_id), jenis (tagihan/pembayaran/peringatan)
 */

session_start();
if (!isset($_SESSION['user_id'])) {
    die("Akses ditolak. Silakan login.");
}

require_once '../config.php';
require_once '../includes/wa_helper.php';

$tagihan_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$jenis = isset($_GET['jenis']) ? $_GET['jenis'] : '';

if ($tagihan_id > 0 && !empty($jenis)) {
    $wa_link = buildWALinkFromTagihan($conn, $tagihan_id, $jenis);
    
    if ($wa_link) {
        // Logika sederhana: Redirect ke link WA
        header("Location: " . $wa_link);
        exit();
    } else {
        echo "<script>alert('Gagal membuat link WA. Pastikan nomor WA pelanggan sudah diisi dan template sudah dikonfigurasi.'); window.history.back();</script>";
    }
} else {
    echo "Parameter tidak valid.";
}
