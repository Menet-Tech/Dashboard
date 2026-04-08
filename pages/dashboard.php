<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}

// Data menu
$menus = [
    [
        'name' => 'Billing',
        'icon' => 'fa-file-invoice-dollar',
        'description' => 'Kelola tagihan dan pembayaran',
        'color' => 'blue',
        'link' => '#billing'
    ],
    [
        'name' => 'Maps',
        'icon' => 'fa-map-marked-alt',
        'description' => 'Pemetaan pelanggan dan area jaringan',
        'color' => 'green',
        'link' => '#maps'
    ],
    [
        'name' => 'User',
        'icon' => 'fa-users',
        'description' => 'Manajemen pengguna dan pelanggan',
        'color' => 'purple',
        'link' => '#user'
    ],
    [
        'name' => 'Mikrotik',
        'icon' => 'fa-network-wired',
        'description' => 'Konfigurasi dan monitoring Mikrotik',
        'color' => 'orange',
        'link' => '#mikrotik'
    ]
];
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Billing System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
    <?php include '../includes/navbar.php'; ?>

    <!-- Main Content Area -->
    <div class="main-content">
        <?php include '../includes/header.php'; ?>

        <div class="content-body">
            <div class="menu-grid">
                <?php foreach ($menus as $menu): ?>
                    <div class="menu-card">
                        <i class="fas <?php echo $menu['icon']; ?> menu-icon"></i>
                        <h3 class="menu-title"><?php echo $menu['name']; ?></h3>
                        <p class="menu-desc"><?php echo $menu['description']; ?></p>
                        <a href="<?php echo $menu['link']; ?>" class="btn">
                            <i class="fas fa-arrow-right"></i> Buka
                        </a>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <script src="../assets/js/script.js"></script>
</body>
</html>
