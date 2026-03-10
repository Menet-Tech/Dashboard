<!-- Main Content Header -->
<?php 
// Include config untuk mendapatkan custom date
require_once __DIR__ . '/config.php';

// Dapatkan custom date dan format untuk ditampilkan
$current_datetime = getCurrentDateTime();
$date_obj = new DateTime($current_datetime);
$formatted_date = $date_obj->format('l, d F Y H:i:s');

// Format ke Indonesian locale
$day_names = ['Sunday' => 'Minggu', 'Monday' => 'Senin', 'Tuesday' => 'Selasa', 'Wednesday' => 'Rabu', 'Thursday' => 'Kamis', 'Friday' => 'Jumat', 'Saturday' => 'Sabtu'];
$month_names = ['January' => 'Januari', 'February' => 'Februari', 'March' => 'Maret', 'April' => 'April', 'May' => 'Mei', 'June' => 'Juni', 'July' => 'Juli', 'August' => 'Agustus', 'September' => 'September', 'October' => 'Oktober', 'November' => 'November', 'December' => 'Desember'];

$eng_day = $date_obj->format('l');
$eng_month = $date_obj->format('F');
$indo_day = $day_names[$eng_day] ?? $eng_day;
$indo_month = $month_names[$eng_month] ?? $eng_month;

$day_num = $date_obj->format('d');
$year = $date_obj->format('Y');
$time = $date_obj->format('H:i');

$display_date = $indo_day . ', ' . $day_num . ' ' . $indo_month . ' ' . $year . ' ' . $time;
?>
<div class="content-header">
    <div class="welcome-section">
        <h1>Selamat Datang</h1>
        <p>Dashboard Manajemen Sistem Billing</p>
    </div>
    <div class="header-actions">
        <a href="date_setting.php" class="date-time" title="Klik untuk mengatur tanggal & jam" data-datetime="<?php echo htmlspecialchars($current_datetime); ?>">
            <i class="fas fa-calendar-alt"></i>
            <span id="current-date"><?php echo $display_date; ?></span>
        </a>
        <div class="notifications">
            <i class="fas fa-bell"></i>
            <span class="badge">3</span>
        </div>
    </div>
</div>

<style>
.date-time {
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 8px 12px;
    border-radius: 6px;
    text-decoration: none;
    color: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
}

.date-time:hover {
    background: rgba(102, 126, 234, 0.1);
    transform: translateY(-2px);
}
</style>

<script>
// Tambahkan fungsi khusus untuk header
document.addEventListener('DOMContentLoaded', function() {
    const dateElement = document.getElementById('current-date');
    const dateLink = document.querySelector('.date-time');
    
    if (dateElement && dateLink) {
        // Ambil datetime dari data attribute (dari PHP)
        let baseDateTime = dateLink.getAttribute('data-datetime');
        if (!baseDateTime) {
            baseDateTime = new Date().toISOString();
        }
        
        // Fungsi untuk update display tanggal
        function updateDisplay() {
            // Parse datetime dari PHP
            const baseDate = new Date(baseDateTime);
            
            // Hitung offset waktu yang sudah berlalu
            const nowClient = new Date();
            const startTime = new Date(); // Waktu halaman dimuat
            const elapsed = nowClient - startTime;
            
            // Tambahkan elapsed ke base datetime
            const currentDateTime = new Date(baseDate.getTime() + elapsed);
            
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            dateElement.textContent = currentDateTime.toLocaleDateString('id-ID', options);
        }
        
        // Update initial display
        updateDisplay();
        
        // Update setiap detik
        setInterval(updateDisplay, 1000);
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
