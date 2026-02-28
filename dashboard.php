<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
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
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <!-- Sidebar Navigation -->
    <div class="sidebar">
        <div class="sidebar-header">
            <div class="brand">
                <div class="brand-logo">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="brand-info">
                    <h2>Sistem Billing</h2>
                    <span>Dashboard Management</span>
                </div>
            </div>
        </div>
        
        <div class="sidebar-menu">
            <?php foreach ($menus as $menu): ?>
                <a href="<?php echo $menu['link']; ?>" class="sidebar-item">
                    <i class="fas <?php echo $menu['icon']; ?>"></i>
                    <span><?php echo $menu['name']; ?></span>
                </a>
            <?php endforeach; ?>
        </div>
        
        <div class="sidebar-footer">
            <div class="user-info">
                <div class="user-avatar">U</div>
                <div class="user-details">
                    <span class="username">User</span>
                    <span class="user-role">Administrator</span>
                </div>
            </div>
            <a href="login.php" class="logout-btn">
                <i class="fas fa-sign-out-alt"></i>
                <span>Logout</span>
            </a>
        </div>
    </div>

    <!-- Main Content Area -->
    <div class="main-content">
        <div class="content-header">
            <div class="welcome-section">
                <h1>Selamat Datang</h1>
                <p>Dashboard Manajemen Sistem Billing</p>
            </div>
            <div class="header-actions">
                <div class="date-time">
                    <i class="fas fa-calendar-alt"></i>
                    <span id="current-date"></span>
                </div>
                <div class="notifications">
                    <i class="fas fa-bell"></i>
                    <span class="badge">3</span>
                </div>
            </div>
        </div>

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

    <script src="script.js"></script>
</body>
</html>
