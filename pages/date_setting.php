<?php
session_start();
include '../config.php';

// Tentukan zona waktu default
$timezone = 'Asia/Jakarta';
if (isset($_COOKIE['app_timezone'])) {
    $timezone = $_COOKIE['app_timezone'];
}

date_default_timezone_set($timezone);

// Initialize pesan
$success_msg = '';
$error_msg = '';
$current_date_display = date('Y-m-d H:i:s');
$current_timestamp = time();

// Proses form
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action'])) {
        switch ($_POST['action']) {
            // Mode Manual: Ubah tanggal
            case 'set_manual_date':
                $manual_date = isset($_POST['manual_date']) ? $_POST['manual_date'] : '';
                $manual_time = isset($_POST['manual_time']) ? $_POST['manual_time'] : '';
                
                if ($manual_date && $manual_time) {
                    $datetime_str = $manual_date . ' ' . $manual_time;
                    if (strtotime($datetime_str)) {
                        setcookie('app_custom_date', $datetime_str, time() + (365 * 24 * 60 * 60), '/');
                        setcookie('app_auto_sync', 'false', time() + (365 * 24 * 60 * 60), '/');
                        $success_msg = 'Tanggal berhasil diubah menjadi: ' . $datetime_str;
                    } else {
                        $error_msg = 'Format tanggal tidak valid!';
                    }
                }
                break;

            // Mode Automatic: Sync dengan sistem
            case 'set_auto_sync':
                setcookie('app_auto_sync', 'true', time() + (365 * 24 * 60 * 60), '/');
                setcookie('app_custom_date', '', time() - 3600, '/');
                $success_msg = 'Sync otomatis diaktifkan. Tanggal akan mengikuti sistem.';
                break;

            // Ubah Timezone
            case 'set_timezone':
                $new_timezone = isset($_POST['timezone']) ? $_POST['timezone'] : 'Asia/Jakarta';
                setcookie('app_timezone', $new_timezone, time() + (365 * 24 * 60 * 60), '/');
                $timezone = $new_timezone;
                date_default_timezone_set($timezone);
                $success_msg = 'Timezone berhasil diubah menjadi: ' . $new_timezone;
                $current_date_display = date('Y-m-d H:i:s');
                break;

            // Reset ke default
            case 'reset_default':
                setcookie('app_custom_date', '', time() - 3600, '/');
                setcookie('app_auto_sync', 'true', time() + (365 * 24 * 60 * 60), '/');
                setcookie('app_timezone', 'Asia/Jakarta', time() + (365 * 24 * 60 * 60), '/');
                $success_msg = 'Pengaturan direset ke default.';
                $current_date_display = date('Y-m-d H:i:s');
                break;
        }
    }
}

// Tentukan mode saat ini
$auto_sync = isset($_COOKIE['app_auto_sync']) ? $_COOKIE['app_auto_sync'] === 'true' : true;
$custom_date = isset($_COOKIE['app_custom_date']) ? $_COOKIE['app_custom_date'] : '';

// Jika custom date, gunakan itu
if ($custom_date && !$auto_sync) {
    $current_date_display = $custom_date;
}

// List timezone
$timezones = DateTimeZone::listIdentifiers();
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pengaturan Tanggal & Jam</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }

        .header-section {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 20px;
        }

        .header-section h1 {
            color: #667eea;
            font-size: 28px;
            margin-bottom: 10px;
        }

        .header-section p {
            color: #666;
            font-size: 14px;
        }

        .current-display {
            background: #f8f9fa;
            border: 2px solid #667eea;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: center;
        }

        .current-display .label {
            font-size: 12px;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .current-display .value {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }

        .mode-indicator {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
            padding: 8px;
            background: #e8eaf6;
            border-radius: 5px;
        }

        .mode-indicator.auto {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .mode-indicator.manual {
            background: #ffe0b2;
            color: #e65100;
        }

        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .alert.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .alert.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .settings-section {
            margin-bottom: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }

        .settings-section h2 {
            font-size: 16px;
            color: #667eea;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }

        .form-group input,
        .form-group select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.3s;
        }

        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .input-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            text-decoration: none;
        }

        .btn-primary {
            background: #667eea;
            color: white;
        }

        .btn-primary:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-success {
            background: #28a745;
            color: white;
        }

        .btn-success:hover {
            background: #218838;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
        }

        .btn-secondary {
            background: #6c757d;
            color: white;
        }

        .btn-secondary:hover {
            background: #5a6268;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(108, 117, 125, 0.4);
        }

        .btn-danger {
            background: #dc3545;
            color: white;
        }

        .btn-danger:hover {
            background: #c82333;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
        }

        .btn-block {
            width: 100%;
            grid-column: 1 / -1;
        }

        .back-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #667eea;
            text-decoration: none;
            margin-bottom: 20px;
            transition: color 0.3s;
        }

        .back-button:hover {
            color: #5568d3;
        }

        .form-divider {
            height: 1px;
            background: #ddd;
            margin: 25px 0;
        }

        @media(max-width: 600px) {
            .container {
                padding: 20px;
            }

            .button-group {
                grid-template-columns: 1fr;
            }

            .header-section h1 {
                font-size: 24px;
            }

            .current-display .value {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="dashboard.php" class="back-button">
            <i class="fas fa-arrow-left"></i> Kembali
        </a>

        <div class="header-section">
            <h1><i class="fas fa-calendar-check"></i> Pengaturan Tanggal & Jam</h1>
            <p>Kelola pengaturan tanggal, jam, dan zona waktu sistem</p>
        </div>

        <div class="current-display">
            <div class="label">Tanggal & Jam Saat Ini</div>
            <div class="value"><?php echo $current_date_display; ?></div>
            <div class="mode-indicator <?php echo $auto_sync ? 'auto' : 'manual'; ?>">
                <i class="fas fa-<?php echo $auto_sync ? 'sync-alt' : 'lock'; ?>"></i>
                Mode: <?php echo $auto_sync ? 'AUTOMATIC SYNC' : 'MANUAL'; ?>
            </div>
        </div>

        <?php if ($success_msg): ?>
        <div class="alert success">
            <i class="fas fa-check-circle"></i>
            <?php echo $success_msg; ?>
        </div>
        <?php endif; ?>

        <?php if ($error_msg): ?>
        <div class="alert error">
            <i class="fas fa-exclamation-circle"></i>
            <?php echo $error_msg; ?>
        </div>
        <?php endif; ?>

        <!-- Automatic Sync Section -->
        <div class="settings-section">
            <h2><i class="fas fa-sync-alt"></i> Automatic Sync</h2>
            <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                Tanggal dan jam akan otomatis menyesuaikan dengan sistem operasi Anda.
            </p>
            <form method="POST" style="margin: 0;">
                <input type="hidden" name="action" value="set_auto_sync">
                <button type="submit" class="btn btn-success btn-block" <?php echo $auto_sync ? 'disabled' : ''; ?>>
                    <i class="fas fa-check"></i> Aktifkan Sync Otomatis
                </button>
            </form>
        </div>

        <div class="form-divider"></div>

        <!-- Manual Set Section -->
        <div class="settings-section">
            <h2><i class="fas fa-calendar"></i> Atur Manual</h2>
            <form method="POST">
                <input type="hidden" name="action" value="set_manual_date">
                <div class="input-group">
                    <div class="form-group">
                        <label for="manual_date">Tanggal</label>
                        <input type="date" id="manual_date" name="manual_date" required>
                    </div>
                    <div class="form-group">
                        <label for="manual_time">Jam</label>
                        <input type="time" id="manual_time" name="manual_time" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-save"></i> Simpan Tanggal Manual
                </button>
            </form>
        </div>

        <div class="form-divider"></div>

        <!-- Timezone Section -->
        <div class="settings-section">
            <h2><i class="fas fa-globe"></i> Zona Waktu</h2>
            <form method="POST">
                <input type="hidden" name="action" value="set_timezone">
                <div class="form-group">
                    <label for="timezone">Pilih Zona Waktu</label>
                    <select id="timezone" name="timezone" required>
                        <optgroup label="Indonesia">
                            <option value="Asia/Jakarta" <?php echo $timezone === 'Asia/Jakarta' ? 'selected' : ''; ?>>WIB - Asia/Jakarta (UTC+7)</option>
                            <option value="Asia/Makassar" <?php echo $timezone === 'Asia/Makassar' ? 'selected' : ''; ?>>WITA - Asia/Makassar (UTC+8)</option>
                            <option value="Asia/Jayapura" <?php echo $timezone === 'Asia/Jayapura' ? 'selected' : ''; ?>>WIT - Asia/Jayapura (UTC+9)</option>
                        </optgroup>
                        <optgroup label="Asia">
                            <option value="Asia/Bangkok" <?php echo $timezone === 'Asia/Bangkok' ? 'selected' : ''; ?>>Bangkok (UTC+7)</option>
                            <option value="Asia/Singapore" <?php echo $timezone === 'Asia/Singapore' ? 'selected' : ''; ?>>Singapore (UTC+8)</option>
                            <option value="Asia/Manila" <?php echo $timezone === 'Asia/Manila' ? 'selected' : ''; ?>>Manila (UTC+8)</option>
                            <option value="Asia/Tokyo" <?php echo $timezone === 'Asia/Tokyo' ? 'selected' : ''; ?>>Tokyo (UTC+9)</option>
                            <option value="Asia/Hong_Kong" <?php echo $timezone === 'Asia/Hong_Kong' ? 'selected' : ''; ?>>Hong Kong (UTC+8)</option>
                        </optgroup>
                        <optgroup label="Worldwide">
                            <option value="UTC" <?php echo $timezone === 'UTC' ? 'selected' : ''; ?>>UTC (UTC±0)</option>
                            <option value="Europe/London" <?php echo $timezone === 'Europe/London' ? 'selected' : ''; ?>>London (UTC+0)</option>
                            <option value="America/New_York" <?php echo $timezone === 'America/New_York' ? 'selected' : ''; ?>>New York (UTC-5)</option>
                            <option value="America/Los_Angeles" <?php echo $timezone === 'America/Los_Angeles' ? 'selected' : ''; ?>>Los Angeles (UTC-8)</option>
                        </optgroup>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-save"></i> Simpan Zona Waktu
                </button>
            </form>
        </div>

        <div class="form-divider"></div>

        <!-- Reset Section -->
        <div class="settings-section">
            <h2><i class="fas fa-redo"></i> Reset</h2>
            <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                Kembalikan semua pengaturan ke nilai default (Asia/Jakarta dengan Sync Otomatis).
            </p>
            <form method="POST" onsubmit="return confirm('Anda yakin ingin mereset semua pengaturan?');">
                <input type="hidden" name="action" value="reset_default">
                <button type="submit" class="btn btn-danger btn-block">
                    <i class="fas fa-refresh"></i> Reset ke Default
                </button>
            </form>
        </div>
    </div>

    <script>
        // Set default values untuk form manual
        const today = new Date();
        const dateInput = document.getElementById('manual_date');
        const timeInput = document.getElementById('manual_time');

        if (dateInput) {
            dateInput.value = today.toISOString().split('T')[0];
        }

        if (timeInput) {
            timeInput.value = today.toTimeString().slice(0, 5);
        }

        // Auto-refresh setiap detik jika auto sync aktif
        function updateDisplay() {
            <?php if ($auto_sync): ?>
            fetch(window.location.href)
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const newDoc = parser.parseFromString(html, 'text/html');
                    const newDisplay = newDoc.querySelector('.current-display .value');
                    const currentDisplay = document.querySelector('.current-display .value');
                    if (newDisplay && currentDisplay) {
                        currentDisplay.textContent = newDisplay.textContent;
                    }
                });
            <?php endif; ?>
        }

        // Update setiap 5 detik
        <?php if ($auto_sync): ?>
        setInterval(updateDisplay, 5000);
        <?php endif; ?>
    </script>
</body>
</html>
