<?php
/**
 * cek_jatuh_tempo.php
 * Script ini mengecek tagihan yang sudah melewati jatuh tempo dan mengirim alert ke Discord.
 * Mendukung trigger via Web (Manual) dan akan mengalihkan kembali ke halaman asal.
 */

session_start();
if (!isset($_SESSION['user_id'])) {
    die("Akses ditolak.");
}

require_once '../config.php';
require_once '../includes/wa_helper.php';
require_once '../includes/discord_helper.php';

// Ambil semua tagihan BELUM BAYAR yang sudah melewati tanggal jatuh tempo
// Kita filter agar hanya mengambil yang HARI INI telat atau tetap telat tapi belum lunas
$sql = "SELECT 
            t.id as tagihan_id, t.tanggal_jatuh_tempo, 
            p.nama, p.no_wa, 
            pb.name as paket_name, pb.price
        FROM tagihan t
        JOIN pelanggan p ON t.pelanggan_id = p.id
        JOIN paket_bandwidth pb ON p.paket_id = pb.id
        WHERE t.status_bayar = 'belum' 
        AND t.tanggal_jatuh_tempo < CURDATE()
        ORDER BY t.tanggal_jatuh_tempo ASC";

$result = $conn->query($sql);
$overdue_list = [];

if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $today = new DateTime();
        $jt    = new DateTime($row['tanggal_jatuh_tempo']);
        $diff  = $today->diff($jt)->days;

        $overdue_list[] = [
            'nama'            => $row['nama'],
            'no_wa'           => $row['no_wa'],
            'paket'           => $row['paket_name'],
            'harga'           => $row['price'],
            'hari_terlambat'  => $diff,
            'jatuh_tempo'     => date('d/m/Y', strtotime($row['tanggal_jatuh_tempo']))
        ];
    }
}

$message = "";
$message_type = "info";

if (!empty($overdue_list)) {
    $ok = notifyDiscordJatuhTempo($conn, $overdue_list);
    if ($ok) {
        $message = "Alert Discord berhasil dikirim untuk " . count($overdue_list) . " pelanggan yang telat.";
        $message_type = "success";
    } else {
        $message = "Gagal mengirim alert ke Discord. Pastikan Webhook URL sudah diisi di Pengaturan.";
        $message_type = "error";
    }
} else {
    $message = "Tidak ada tagihan jatuh tempo yang ditemukan hari ini.";
}

// Jika diakses via web, simpan pesan di session dan redirect
if (php_sapi_name() != "cli") {
    $_SESSION['flash_message'] = $message;
    $_SESSION['flash_type'] = $message_type;
    
    $redirect = $_GET['redirect'] ?? 'dashboard.php';
    if (strpos($redirect, '..') !== false) $redirect = 'dashboard.php'; // Security check
    
    header("Location: " . $redirect);
    exit();
} else {
    echo $message . "\n";
}
