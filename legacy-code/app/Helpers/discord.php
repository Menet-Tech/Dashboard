<?php

declare(strict_types=1);

use App\Models\Pengaturan;

function discordWebhookUrl(string $channel = 'alert'): ?string
{
    return match ($channel) {
        'billing' => Pengaturan::get('discord_billing_url'),
        default => Pengaturan::get('discord_alert_url') ?: Pengaturan::get('discord_billing_url'),
    };
}

function discordRouteOptions(): array
{
    return [
        'none' => 'Nonaktif',
        'alert' => 'Alert saja',
        'billing' => 'Billing saja',
        'both' => 'Keduanya',
    ];
}

function discordAlertPreferenceDefinitions(): array
{
    return [
        'dashboard_heartbeat' => [
            'label' => 'Dashboard dibuka',
            'description' => 'Dipakai saat dashboard web berhasil diakses.',
            'default' => 'none',
        ],
        'billing_generated' => [
            'label' => 'Generate tagihan',
            'description' => 'Log generate tagihan manual maupun otomatis.',
            'default' => 'billing',
        ],
        'payment_paid' => [
            'label' => 'Pembayaran lunas',
            'description' => 'Tagihan ditandai lunas atau pembayaran dicatat lengkap.',
            'default' => 'billing',
        ],
        'pelanggan_jatuh_tempo' => [
            'label' => 'Pelanggan jatuh tempo',
            'description' => 'Pelanggan melewati jatuh tempo dan masuk limit.',
            'default' => 'alert',
        ],
        'wa_failed' => [
            'label' => 'Masalah WhatsApp',
            'description' => 'WA gateway gagal, reminder gagal, atau kirim WA bermasalah.',
            'default' => 'alert',
        ],
        'mikrotik_failed' => [
            'label' => 'Masalah MikroTik',
            'description' => 'Tes atau koneksi MikroTik gagal.',
            'default' => 'alert',
        ],
        'cron_failed' => [
            'label' => 'Cron / scheduler gagal',
            'description' => 'Alert saat scheduler gagal berjalan.',
            'default' => 'alert',
        ],
    ];
}

function discordAlertPreferenceKey(string $eventKey): string
{
    return 'discord_route_' . $eventKey;
}

function discordChannelsFromPreference(string $value, string $fallbackChannel = 'alert'): array
{
    return match (strtolower(trim($value))) {
        'none' => [],
        'billing' => ['billing'],
        'both' => ['alert', 'billing'],
        'alert' => ['alert'],
        default => [$fallbackChannel],
    };
}

function discordAlertPreferenceValue(string $eventKey): string
{
    $definitions = discordAlertPreferenceDefinitions();
    $default = $definitions[$eventKey]['default'] ?? 'alert';

    return strtolower((string) Pengaturan::get(discordAlertPreferenceKey($eventKey), $default));
}

function discordResolveChannels(?string $eventKey, string $fallbackChannel = 'alert'): array
{
    if ($eventKey === null || $eventKey === '') {
        return [$fallbackChannel];
    }

    return discordChannelsFromPreference(discordAlertPreferenceValue($eventKey), $fallbackChannel);
}

function sendDiscord(?string $webhookUrl, string $message, array $options = []): bool
{
    if (!$webhookUrl) {
        return false;
    }

    $payload = ['content' => $message];

    if (!empty($options['username'])) {
        $payload['username'] = $options['username'];
    }

    if (!empty($options['avatar_url'])) {
        $payload['avatar_url'] = $options['avatar_url'];
    }

    if (!empty($options['embeds'])) {
        $payload['embeds'] = $options['embeds'];
    }

    $ch = curl_init($webhookUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);

    curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $httpCode >= 200 && $httpCode < 300;
}

function sendDiscordToChannels(array $channels, string $message, array $options = []): array
{
    $results = [];
    $targets = [];

    foreach ($channels as $channel) {
        $url = discordWebhookUrl((string) $channel);
        if (!$url) {
            $results[] = [
                'channel' => (string) $channel,
                'success' => false,
                'configured' => false,
                'url' => null,
            ];
            continue;
        }

        $targets[$url] ??= [
            'url' => $url,
            'channels' => [],
        ];
        $targets[$url]['channels'][] = (string) $channel;
    }

    foreach ($targets as $target) {
        $success = sendDiscord($target['url'], $message, $options);
        $results[] = [
            'channel' => implode('+', $target['channels']),
            'success' => $success,
            'configured' => true,
            'url' => $target['url'],
        ];
    }

    $configured = array_values(array_filter($results, static fn (array $result): bool => $result['configured'] === true));
    $successCount = count(array_filter($configured, static fn (array $result): bool => $result['success'] === true));

    return [
        'results' => $results,
        'attempted' => count($configured),
        'success_count' => $successCount,
        'success' => $successCount > 0 && $successCount === count($configured),
    ];
}

function discordColor(string $level): int
{
    return match ($level) {
        'success' => hexdec('16A34A'),
        'warning' => hexdec('D97706'),
        'danger' => hexdec('DC2626'),
        default => hexdec('0F766E'),
    };
}

function discordBroadcast(string $title, string $description, array $fields = [], array $channels = ['alert'], string $level = 'info'): array
{
    $embedFields = array_map(static function (array $field): array {
        return [
            'name' => (string) ($field['name'] ?? '-'),
            'value' => (string) ($field['value'] ?? '-'),
            'inline' => (bool) ($field['inline'] ?? true),
        ];
    }, $fields);

    return sendDiscordToChannels($channels, '', [
        'username' => 'Menet-Tech Alert',
        'embeds' => [[
            'title' => $title,
            'description' => $description,
            'color' => discordColor($level),
            'fields' => $embedFields,
            'timestamp' => gmdate('c'),
        ]],
    ]);
}

function discordNotify(
    string $title,
    string $description,
    array $fields = [],
    string $channel = 'alert',
    string $level = 'info',
    ?string $eventKey = null
): bool {
    $channels = discordResolveChannels($eventKey, $channel);
    if ($channels === []) {
        return false;
    }

    return discordBroadcast($title, $description, $fields, $channels, $level)['success'];
}
