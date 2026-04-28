<?php

declare(strict_types=1);

namespace App\Models;

class Pengaturan extends BaseModel
{
    private const KEY_ALIASES = [
        'wa_gateway_url' => ['wa_gateway_url', 'whatsapp_gateway_url'],
        'wa_api_key' => ['wa_api_key', 'whatsapp_api_key'],
        'wa_account_id' => ['wa_account_id'],
        'wa_fallback_wa_me' => ['wa_fallback_wa_me'],
        'discord_billing_url' => ['discord_billing_url'],
        'discord_alert_url' => ['discord_alert_url'],
    ];

    public function all(): array
    {
        $stmt = $this->db->query('SELECT `key`, `value`, `description` FROM pengaturan ORDER BY `key` ASC');
        $rows = $stmt->fetchAll();
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['key']] = $row;
        }

        return $settings;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        try {
            $instance = new self();
            $candidateKeys = self::KEY_ALIASES[$key] ?? [$key];

            $in = implode(',', array_fill(0, count($candidateKeys), '?'));
            $stmt = $instance->db->prepare("SELECT `key`, `value` FROM pengaturan WHERE `key` IN ({$in}) ORDER BY FIELD(`key`, {$in}) LIMIT 1");
            $stmt->execute([...$candidateKeys, ...$candidateKeys]);
            $row = $stmt->fetch();

            if ($row && $row['value'] !== '') {
                return (string) $row['value'];
            }
        } catch (\Throwable) {
            // Fall back to environment/default when DB is not reachable,
            // especially useful for tests and offline tooling.
        }

        return $_ENV[strtoupper($key)] ?? $default;
    }

    public function saveMany(array $settings): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO pengaturan (`key`, `value`, `description`) VALUES (:key, :value, :description)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `description` = VALUES(`description`)'
        );

        foreach ($settings as $key => $value) {
            $stmt->execute([
                'key' => $key,
                'value' => (string) ($value['value'] ?? ''),
                'description' => $value['description'] ?? null,
            ]);
        }
    }

    public static function set(string $key, string $value, ?string $description = null): void
    {
        $instance = new self();
        $stmt = $instance->db->prepare(
            'INSERT INTO pengaturan (`key`, `value`, `description`) VALUES (:key, :value, :description)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `description` = COALESCE(VALUES(`description`), `description`)'
        );
        $stmt->execute([
            'key' => $key,
            'value' => $value,
            'description' => $description,
        ]);
    }
}
