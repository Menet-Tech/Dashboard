<?php

declare(strict_types=1);

namespace App\Support;

class ServiceStatus
{
    public static function snapshot(string $cachedMessage, ?array $healthRow, string $fallbackMessage): array
    {
        $message = trim($cachedMessage) !== '' ? trim($cachedMessage) : (string) ($healthRow['message'] ?? $fallbackMessage);
        $healthStatus = strtolower((string) ($healthRow['status'] ?? ''));
        $normalizedMessage = strtolower($message);

        $success = $healthStatus === 'ok'
            || str_contains($normalizedMessage, 'online')
            || str_contains($normalizedMessage, 'sehat')
            || str_contains($normalizedMessage, 'berhasil');

        if ($healthStatus === 'failed') {
            $success = false;
        }

        return [
            'success' => $success,
            'message' => $message,
        ];
    }
}
