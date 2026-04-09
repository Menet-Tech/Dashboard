<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}
require_once '../config.php';
require_once '../includes/wa_helper.php';

$message = '';
$message_type = '';

// Handle save setting
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_settings'])) {
    $keys = ['discord_webhook_tagihan', 'discord_webhook_alert', 'nama_isp', 'nomor_rekening'];
    foreach ($keys as $key) {
        $val = trim($_POST[$key] ?? '');
        $stmt = $conn->prepare(
            "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
        );
        $stmt->bind_param("ss", $key, $val);
        $stmt->execute();
        $stmt->close();
    }
    $message = "Pengaturan berhasil disimpan!";
    $message_type = "success";
}

// Handle test Discord webhook
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['test_discord'])) {
    require_once '../includes/discord_helper.php';
    $channel_key = $_POST['channel_key'] ?? '';
    $webhook_url = getAppSetting($conn, $channel_key, '');
    if (empty($webhook_url)) {
        $message = "Webhook URL belum diisi untuk channel ini!";
        $message_type = "error";
    } else {
        $label = $channel_key === 'discord_webhook_tagihan' ? 'Generate Tagihan' : 'Alert Jatuh Tempo';
        $ok = sendDiscordWebhook($webhook_url, '', [[
            'title'       => "🔔 Test Webhook — {$label}",
            'color'       => 5814783,
            'description' => "Koneksi Discord berhasil! Webhook ini digunakan untuk notifikasi **{$label}**.",
            'footer'      => ['text' => 'Dikirim dari Dashboard Billing'],
            'timestamp'   => date('c'),
        ]]);
        $message = $ok
            ? "Test berhasil! Cek channel Discord kamu."
            : "Gagal mengirim. Pastikan webhook URL benar dan channel Discord aktif.";
        $message_type = $ok ? 'success' : 'error';
    }
}

// Ambil semua settings
$settings = [];
$res = $conn->query("SELECT setting_key, setting_value, keterangan FROM app_settings");
while ($row = $res->fetch_assoc()) {
    $settings[$row['setting_key']] = $row;
}

function sv($settings, $key) {
    return htmlspecialchars($settings[$key]['setting_value'] ?? '');
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pengaturan Aplikasi - Billing System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="../assets/css/style.css">
    <style>
        .settings-section { background: var(--card-bg, #fff); border-radius: 12px; padding: 28px; margin-bottom: 24px; box-shadow: 0 2px 12px rgba(0,0,0,.07); }
        .settings-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 18px; color: var(--primary, #667eea); display: flex; align-items: center; gap: 8px; }
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #555; }
        .form-group input { width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color .2s; }
        .form-group input:focus { outline: none; border-color: #667eea; }
        .form-group .hint { font-size: 11px; color: #999; margin-top: 4px; }
        .webhook-row { display: flex; gap: 8px; align-items: flex-start; }
        .webhook-row input { flex: 1; }
        .btn-test { padding: 10px 14px; background: #764ba2; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; white-space: nowrap; transition: background .2s; }
        .btn-test:hover { background: #5e3a82; }
        .btn-save { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; border: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
        .btn-save:hover { opacity: .9; }
        .message { padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; font-size: 14px; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error   { background: #f8d7da; color: #721c24; }
        @media(max-width:768px) { .settings-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <?php include '../includes/navbar.php'; ?>
    <div class="main-content">
        <?php include '../includes/header.php'; ?>
        <div class="content-body">
            <div style="margin-bottom:20px;">
                <h2 style="font-size:20px;font-weight:700;color:#333;"><i class="fas fa-cog"></i> Pengaturan Aplikasi</h2>
                <p style="color:#666;font-size:13px;">Kelola konfigurasi Discord, WA, dan informasi ISP.</p>
            </div>

            <?php if ($message): ?>
            <div class="message <?php echo $message_type; ?>">
                <i class="fas fa-<?php echo $message_type === 'success' ? 'check-circle' : 'exclamation-circle'; ?>"></i>
                <?php echo htmlspecialchars($message); ?>
            </div>
            <?php endif; ?>

            <form method="POST">
                <!-- Discord Settings -->
                <div class="settings-section">
                    <h2><i class="fab fa-discord"></i> Notifikasi Discord</h2>
                    <div style="margin-bottom:16px;">
                        <div class="form-group" style="margin-bottom:16px;">
                            <label><i class="fas fa-hashtag"></i> Webhook URL — Channel Log Generate Tagihan</label>
                            <div class="webhook-row">
                                <input type="url" name="discord_webhook_tagihan"
                                       value="<?php echo sv($settings,'discord_webhook_tagihan'); ?>"
                                       placeholder="https://discord.com/api/webhooks/...">
                                <button type="submit" name="test_discord" class="btn-test" formnovalidate
                                        onclick="document.querySelector('[name=channel_key]').value='discord_webhook_tagihan'">
                                    <i class="fas fa-paper-plane"></i> Test
                                </button>
                            </div>
                            <div class="hint"><?php echo htmlspecialchars($settings['discord_webhook_tagihan']['keterangan'] ?? ''); ?></div>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-hashtag"></i> Webhook URL — Channel Alert Jatuh Tempo</label>
                            <div class="webhook-row">
                                <input type="url" name="discord_webhook_alert"
                                       value="<?php echo sv($settings,'discord_webhook_alert'); ?>"
                                       placeholder="https://discord.com/api/webhooks/...">
                                <button type="submit" name="test_discord" class="btn-test" formnovalidate
                                        onclick="document.querySelector('[name=channel_key]').value='discord_webhook_alert'">
                                    <i class="fas fa-paper-plane"></i> Test
                                </button>
                            </div>
                            <div class="hint"><?php echo htmlspecialchars($settings['discord_webhook_alert']['keterangan'] ?? ''); ?></div>
                        </div>
                        <input type="hidden" name="channel_key" value="">
                    </div>
                    <div style="background:#f0f4ff;border-radius:8px;padding:12px;font-size:12px;color:#556;">
                        <b>Cara membuat Discord Webhook:</b> Buka Discord → Server Settings → Integrations → Webhooks → New Webhook → Copy URL
                    </div>
                </div>

                <!-- ISP Info -->
                <div class="settings-section">
                    <h2><i class="fab fa-whatsapp"></i> Informasi ISP & Pembayaran</h2>
                    <div class="settings-grid">
                        <div class="form-group">
                            <label>Nama ISP</label>
                            <input type="text" name="nama_isp" value="<?php echo sv($settings,'nama_isp'); ?>" placeholder="Menet Tech">
                            <div class="hint">Ditampilkan di footer setiap pesan WA</div>
                        </div>
                        <div class="form-group">
                            <label>Nomor Rekening Pembayaran</label>
                            <input type="text" name="nomor_rekening" value="<?php echo sv($settings,'nomor_rekening'); ?>" placeholder="BCA 1234567890 a/n Nama">
                            <div class="hint">Ditampilkan di pesan tagihan dan peringatan</div>
                        </div>
                    </div>
                </div>

                <button type="submit" name="save_settings" class="btn-save">
                    <i class="fas fa-save"></i> Simpan Semua Pengaturan
                </button>
            </form>
        </div>
    </div>
    <script src="../assets/js/script.js"></script>
</body>
</html>
