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

function discordColor(string $level): int
{
    return match ($level) {
        'success' => hexdec('16A34A'),
        'warning' => hexdec('D97706'),
        'danger' => hexdec('DC2626'),
        default => hexdec('0F766E'),
    };
}

function discordNotify(string $title, string $description, array $fields = [], string $channel = 'alert', string $level = 'info'): bool
{
    $embedFields = array_map(static function (array $field): array {
        return [
            'name' => (string) ($field['name'] ?? '-'),
            'value' => (string) ($field['value'] ?? '-'),
            'inline' => (bool) ($field['inline'] ?? true),
        ];
    }, $fields);

    return sendDiscord(discordWebhookUrl($channel), '', [
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
