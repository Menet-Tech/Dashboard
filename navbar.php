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
        <a href="http://localhost/billing/dashboard.php" class="sidebar-item">
            <i class="fas fa-home"></i>
            <span>Dashboard</span>
        </a>
        <a href="dashboard.php" class="sidebar-item">
            <i class="fas fa-file-invoice-dollar"></i>
            <span>Billing</span>
        </a>
        <a href="../dashboard.php" class="sidebar-item">
            <i class="fas fa-map-marked-alt"></i>
            <span>Maps</span>
        </a>
        <a href="http://localhost/billing/pelanggan.php" class="sidebar-item">
            <i class="fas fa-users"></i>
            <span>Pelanggan</span>
        </a>
        <div class="sidebar-item dropdown-item">
            <a href="dashboard.php" class="sidebar-link">
                <i class="fas fa-network-wired"></i>
                <span>Mikrotik</span>
                <i class="fas fa-chevron-down dropdown-arrow"></i>
            </a>
            <div class="dropdown-menu">
                <a href="http://localhost/billing/mikrotik/pool.php" class="dropdown-item-link">
                    <i class="fas fa-layer-group"></i>
                    <span>IP Pool</span>
                </a>
                                <a href="http://localhost/billing/mikrotik/paket.php" class="dropdown-item-link">
                    <i class="fas fa-layer-group"></i>
                    <span>Paket Bandwith</span>
                </a>
            </div>
        </div>
    </div>
    
    <div class="sidebar-footer">
        <div class="user-info">
            <div class="user-avatar">U</div>
            <div class="user-details">
                <span class="username">User</span>
                <span class="user-role">Administrator</span>
            </div>
        </div>
        <a href="../login.php" class="logout-btn">
            <i class="fas fa-sign-out-alt"></i>
            <span>Logout</span>
        </a>
    </div>
</div>