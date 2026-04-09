<?php

declare(strict_types=1);

namespace App\Models;

class MikroTikAPI
{
    public function testConnection(?string $testUsername = null): array
    {
        $host = Pengaturan::get('mikrotik_host', '');
        $user = Pengaturan::get('mikrotik_user', '');

        if ($host === '' || $user === '') {
            return [
                'success' => false,
                'message' => 'Host atau username MikroTik belum diisi.',
            ];
        }

        $message = 'Konfigurasi MikroTik terbaca. ';
        $message .= $testUsername
            ? "Mode test menggunakan username {$testUsername}. "
            : 'Mode test tanpa username dummy. ';
        $message .= 'Integrasi RouterOS saat ini masih stub aman dan belum terkoneksi ke router sungguhan.';

        ActionLog::create(null, 'MIKROTIK_TEST', 'success', $message);

        return [
            'success' => true,
            'message' => $message,
        ];
    }

    public function limitUser(string $username, string $newProfile = 'default-limit'): bool
    {
        ActionLog::create(null, 'MIKROTIK_STUB', 'success', "Stub limit user {$username} ke profile {$newProfile}");
        return true;
    }
}
