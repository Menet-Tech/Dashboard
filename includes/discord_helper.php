<?php
/**
 * Discord Webhook Helper
 * Fungsi untuk mengirim notifikasi ke channel Discord via webhook
 */

/**
 * Kirim pesan ke Discord webhook
 * @param string $webhook_url  URL webhook Discord
 * @param string $content      Teks biasa (opsional)
 * @param array  $embeds       Array embed objects (opsional)
 * @return bool                True jika berhasil
 */
function sendDiscordWebhook($webhook_url, $content = '', $embeds = []) {
    if (empty($webhook_url)) return false;

    $payload = [];
    if (!empty($content)) $payload['content'] = $content;
    if (!empty($embeds))  $payload['embeds']  = $embeds;
    if (empty($payload))  return false;

    $json = json_encode($payload);

    $ch = curl_init($webhook_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Discord returns 204 No Content on success
    return $http_code === 204 || $http_code === 200;
}

/**
 * Kirim notifikasi ke Discord setelah generate tagihan bulanan
 * Channel: discord_webhook_tagihan
 *
 * @param mysqli $conn
 * @param int    $generated   Jumlah tagihan baru dibuat
 * @param int    $skipped     Jumlah pelanggan dilewati
 * @param int    $total       Total pelanggan aktif
 */
function notifyDiscordGenerateTagihan($conn, $generated, $skipped, $total) {
    $webhook_url = getDiscordWebhook($conn, 'discord_webhook_tagihan');
    if (empty($webhook_url)) return false;

    $now = date('d/m/Y H:i:s');
    $status_icon = $generated > 0 ? '✅' : 'ℹ️';

    $embeds = [[
        'title'       => "{$status_icon} Generate Tagihan Bulanan",
        'color'       => $generated > 0 ? 3066993 : 15844367, // hijau atau kuning
        'fields'      => [
            ['name' => '📋 Tagihan Dibuat',    'value' => "**{$generated}**",          'inline' => true],
            ['name' => '⏭️ Dilewati',          'value' => "**{$skipped}**",            'inline' => true],
            ['name' => '👥 Total Pelanggan',   'value' => "**{$total}**",              'inline' => true],
        ],
        'footer'      => ['text' => "Dijalankan: {$now}"],
        'timestamp'   => date('c'),
    ]];

    return sendDiscordWebhook($webhook_url, '', $embeds);
}

/**
 * Kirim alert ke Discord untuk pelanggan yang melewati jatuh tempo
 * Channel: discord_webhook_alert
 *
 * @param mysqli $conn
 * @param array  $overdue_list Array pelanggan telat: [['nama', 'no_wa', 'paket', 'harga', 'hari_terlambat', 'jatuh_tempo'], ...]
 */
function notifyDiscordJatuhTempo($conn, $overdue_list) {
    $webhook_url = getDiscordWebhook($conn, 'discord_webhook_alert');
    if (empty($webhook_url) || empty($overdue_list)) return false;

    $now   = date('d/m/Y H:i:s');
    $total = count($overdue_list);

    // Buat daftar pelanggan telat
    $lines = [];
    foreach ($overdue_list as $p) {
        $no_wa = !empty($p['no_wa']) ? $p['no_wa'] : '-';
        $lines[] = "• **{$p['nama']}** ({$no_wa}) — {$p['paket']} — Jatuh tempo: {$p['jatuh_tempo']} _(telat {$p['hari_terlambat']} hari)_";
    }
    $daftar = implode("\n", $lines);

    // Batasi panjang daftar jika terlalu banyak (Discord limit 1024 char per field)
    if (strlen($daftar) > 1000) {
        $shown = array_slice($overdue_list, 0, 10);
        $lines = [];
        foreach ($shown as $p) {
            $no_wa = !empty($p['no_wa']) ? $p['no_wa'] : '-';
            $lines[] = "• **{$p['nama']}** ({$no_wa}) — Telat {$p['hari_terlambat']} hari";
        }
        $daftar = implode("\n", $lines) . "\n\n_...dan " . ($total - 10) . " pelanggan lainnya._";
    }

    $embeds = [[
        'title'       => "🚨 Alert — {$total} Pelanggan Jatuh Tempo",
        'color'       => 15158332, // merah
        'description' => $daftar,
        'footer'      => ['text' => "Dicek: {$now}"],
        'timestamp'   => date('c'),
    ]];

    return sendDiscordWebhook($webhook_url, '', $embeds);
}

/**
 * Ambil Discord webhook URL dari app_settings
 * @param mysqli $conn
 * @param string $key  'discord_webhook_tagihan' | 'discord_webhook_alert'
 * @return string
 */
function getDiscordWebhook($conn, $key) {
    if (!function_exists('getAppSetting')) {
        require_once __DIR__ . '/wa_helper.php';
    }
    return getAppSetting($conn, $key, '');
}
