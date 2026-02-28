<!-- Main Content Header -->
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

<script>
// Tambahkan fungsi khusus untuk header
document.addEventListener('DOMContentLoaded', function() {
    // Tampilkan tanggal dan waktu saat ini
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        dateElement.textContent = now.toLocaleDateString('id-ID', options);
    }

    // Efek hover pada notifikasi
    const notifications = document.querySelector('.notifications');
    if (notifications) {
        notifications.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        });
        
        notifications.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    }
});
</script>
