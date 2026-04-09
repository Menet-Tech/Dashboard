<?php
/**
 * cron/cek_jatuh_tempo_cli.php
 * Script ini mengecek tagihan jatuh tempo via CLI (untuk Windows Task Scheduler)
 * Tanpa session_start() agar bisa dijalankan di background
 */

// Define project path
define('BASE_PATH', dirname(__DIR__));

require_once BASE_PATH . '/config.php';
require_once BASE_PATH . '/includes/wa_helper.php';
require_once BASE_PATH . '/includes/discord_helper.php';

echo "[" . date('Y-m-d H:i:s') . "] Memulai pengecekan jatuh tempo...\n";

// Ambil semua tagihan BELUM BAYAR yang sudah melewati tanggal jatuh tempo
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

if (!empty($overdue_list)) {
    echo "[" . date('Y-m-d H:i:s') . "] Menemukan " . count($overdue_list) . " tagihan telat. Mengirim alert Discord...\n";
    $ok = notifyDiscordJatuhTempo($conn, $overdue_list);
    if ($ok) {
        echo "[" . date('Y-m-d H:i:s') . "] Alert Discord berhasil dikirim.\n";
    } else {
        echo "[" . date('Y-m-d H:i:s') . "] GAGAL mengirim alert Discord. Cek webhook URL di tabel app_settings.\n";
    }
} else {
    echo "[" . date('Y-m-d H:i:s') . "] Tidak ada tagihan jatuh tempo hari ini.\n";
}

$conn->close();
echo "[" . date('Y-m-d H:i:s') . "] Selesai.\n";
