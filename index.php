<?php
session_start();

// Redirect ke dashboard jika sudah login
if (isset($_SESSION['user_id'])) {
    header("Location: dashboard.php");
    exit();
}

// Redirect ke login jika belum login
header("Location: login.php");
exit();
?>