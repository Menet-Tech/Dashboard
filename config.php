<?php
// Konfigurasi Database
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "dashboard";

// Membuat koneksi
$conn = new mysqli($servername, $username, $password, $dbname);

// Cek koneksi
if ($conn->connect_error) {
    die("Koneksi database gagal: " . $conn->connect_error);
}

// ===== PENGATURAN TANGGAL & ZONA WAKTU =====
// Set timezone dari cookie atau default ke Asia/Jakarta
$app_timezone = isset($_COOKIE['app_timezone']) ? $_COOKIE['app_timezone'] : 'Asia/Jakarta';
date_default_timezone_set($app_timezone);

// Fungsi untuk mendapatkan tanggal saat ini (dengan support custom date)
function getCurrentDateTime() {
    // Jika ada custom date di cookie dan mode bukan auto sync
    if (isset($_COOKIE['app_custom_date']) && isset($_COOKIE['app_auto_sync']) && $_COOKIE['app_auto_sync'] === 'false') {
        return $_COOKIE['app_custom_date'];
    }
    // Jika auto sync, gunakan tanggal sistem
    return date('Y-m-d H:i:s');
}

// Fungsi untuk mendapatkan timestamp saat ini
function getCurrentTimestamp() {
    $date_str = getCurrentDateTime();
    return strtotime($date_str);
}

// Fungsi untuk mendapatkan DateTime object saat ini (dengan support custom date)
function getCurrentDateTimeObject() {
    $date_str = getCurrentDateTime();
    return new DateTime($date_str);
}

// Fungsi untuk format tanggal dengan custom date support
function formatCustomDate($format = 'Y-m-d H:i:s') {
    $date_str = getCurrentDateTime();
    return date($format, strtotime($date_str));
}

// ===== FUNGSI UTILITY =====
// Fungsi untuk membersihkan input
function cleanInput($data) {
    return htmlspecialchars(trim($data));
}

// Fungsi untuk validasi format IP address
function validateIP($ip) {
    return filter_var($ip, FILTER_VALIDATE_IP) !== false;
}

// Fungsi untuk validasi range IP
function validateIPRange($start_ip, $end_ip) {
    return ip2long($start_ip) < ip2long($end_ip);
}
?>