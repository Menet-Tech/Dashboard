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