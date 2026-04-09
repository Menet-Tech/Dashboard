<?php

declare(strict_types=1);

namespace App\Models;

use RuntimeException;

class MikroTikAPI
{
    /** @var resource|null */
    private $socket = null;

    public function testConnection(?string $testUsername = null, bool $record = true): array
    {
        try {
            $this->connect();
            $identity = $this->command('/system/identity/print');
            $name = $identity[0]['name'] ?? 'RouterOS';
            $message = "Berhasil terkoneksi ke {$name}.";

            if ($testUsername) {
                $status = $this->getPppoeStatus($testUsername);
                $message .= " Username test {$testUsername}: " . ($status['secret_found'] ? 'ditemukan' : 'tidak ditemukan') . '.';
            }

            $this->disconnect();
            if ($record) {
                ActionLog::create(null, 'MIKROTIK_TEST', 'success', $message);
                (new SystemHealthCheck())->record('mikrotik', 'ok', $message);
            }

            return ['success' => true, 'message' => $message];
        } catch (\Throwable $throwable) {
            $this->disconnect();
            $message = 'Koneksi MikroTik gagal: ' . $throwable->getMessage();
            if ($record) {
                ActionLog::create(null, 'MIKROTIK_TEST', 'failed', $message);
                (new SystemHealthCheck())->record('mikrotik', 'failed', $message);
            }

            return ['success' => false, 'message' => $message];
        }
    }

    public function limitUser(string $username, string $newProfile = 'default-limit'): bool
    {
        try {
            $this->connect();
            $secret = $this->findSecret($username);
            if (!$secret) {
                throw new RuntimeException("Secret PPPoE {$username} tidak ditemukan.");
            }

            $this->command('/ppp/secret/set', [
                '.id' => $secret['.id'],
                'profile' => $newProfile,
            ]);

            $this->kickUser($username);
            $this->disconnect();
            (new SystemHealthCheck())->record('mikrotik', 'ok', "User {$username} dilimit ke profile {$newProfile}");
            return true;
        } catch (\Throwable $throwable) {
            $this->disconnect();
            ActionLog::create(null, 'MIKROTIK_LIMIT', 'failed', $throwable->getMessage());
            (new SystemHealthCheck())->record('mikrotik', 'failed', $throwable->getMessage());
            return false;
        }
    }

    public function activateUser(string $username, string $profile): bool
    {
        try {
            $this->connect();
            $secret = $this->findSecret($username);
            if (!$secret) {
                throw new RuntimeException("Secret PPPoE {$username} tidak ditemukan.");
            }

            $this->command('/ppp/secret/set', [
                '.id' => $secret['.id'],
                'profile' => $profile,
            ]);

            $this->kickUser($username);
            $this->disconnect();
            (new SystemHealthCheck())->record('mikrotik', 'ok', "User {$username} diaktifkan dengan profile {$profile}");
            return true;
        } catch (\Throwable $throwable) {
            $this->disconnect();
            ActionLog::create(null, 'MIKROTIK_ACTIVATE', 'failed', $throwable->getMessage());
            (new SystemHealthCheck())->record('mikrotik', 'failed', $throwable->getMessage());
            return false;
        }
    }

    public function kickUser(string $username): bool
    {
        try {
            if ($this->socket === null) {
                $this->connect();
            }

            $actives = $this->command('/ppp/active/print', ['?name' => $username]);
            foreach ($actives as $active) {
                if (!empty($active['.id'])) {
                    $this->command('/ppp/active/remove', ['.id' => $active['.id']]);
                }
            }

            return true;
        } catch (\Throwable $throwable) {
            ActionLog::create(null, 'MIKROTIK_KICK', 'failed', $throwable->getMessage());
            return false;
        }
    }

    public function syncStatus(string $username): array
    {
        try {
            $this->connect();
            $result = $this->getPppoeStatus($username);
            $this->disconnect();
            return $result;
        } catch (\Throwable $throwable) {
            $this->disconnect();
            return [
                'secret_found' => false,
                'active' => false,
                'message' => $throwable->getMessage(),
            ];
        }
    }

    public function getPppoeStatus(string $username): array
    {
        $secret = $this->findSecret($username);
        $active = $this->command('/ppp/active/print', ['?name' => $username]);

        return [
            'secret_found' => $secret !== null,
            'profile' => $secret['profile'] ?? null,
            'disabled' => $secret['disabled'] ?? null,
            'active' => $active !== [],
            'active_sessions' => $active,
        ];
    }

    private function connect(): void
    {
        if (is_resource($this->socket)) {
            return;
        }

        $host = (string) Pengaturan::get('mikrotik_host', $_ENV['MIKROTIK_HOST'] ?? '');
        $port = (int) Pengaturan::get('mikrotik_port', $_ENV['MIKROTIK_PORT'] ?? '8728');
        $user = (string) Pengaturan::get('mikrotik_user', $_ENV['MIKROTIK_USER'] ?? '');
        $pass = (string) Pengaturan::get('mikrotik_pass', $_ENV['MIKROTIK_PASS'] ?? '');

        if ($host === '' || $user === '') {
            throw new RuntimeException('Konfigurasi MikroTik belum lengkap.');
        }

        $socket = @fsockopen($host, $port, $errno, $errstr, 8);
        if (!$socket) {
            throw new RuntimeException("Tidak bisa membuka socket ke MikroTik ({$errno}: {$errstr})");
        }

        stream_set_timeout($socket, 8);
        $this->socket = $socket;

        $response = $this->command('/login', [
            'name' => $user,
            'password' => $pass,
        ]);

        if (!is_array($response)) {
            throw new RuntimeException('Login MikroTik gagal.');
        }
    }

    private function disconnect(): void
    {
        if (is_resource($this->socket)) {
            fclose($this->socket);
        }

        $this->socket = null;
    }

    private function findSecret(string $username): ?array
    {
        $rows = $this->command('/ppp/secret/print', ['?name' => $username]);
        return $rows[0] ?? null;
    }

    private function command(string $path, array $params = []): array
    {
        $this->writeWord($path);
        foreach ($params as $key => $value) {
            $prefix = str_starts_with((string) $key, '?') || str_starts_with((string) $key, '.') ? $key : '=' . $key;
            $this->writeWord($prefix . '=' . $value);
        }
        $this->writeWord('');

        $response = [];
        while (true) {
            $sentence = $this->readSentence();
            if ($sentence === []) {
                continue;
            }

            $reply = array_shift($sentence);
            $row = [];
            foreach ($sentence as $word) {
                if (str_starts_with($word, '=')) {
                    [$name, $value] = array_pad(explode('=', substr($word, 1), 2), 2, '');
                    $row[$name] = $value;
                } elseif (str_starts_with($word, '.')) {
                    [$name, $value] = array_pad(explode('=', $word, 2), 2, '');
                    $row[$name] = $value;
                }
            }

            if ($reply === '!trap') {
                throw new RuntimeException($row['message'] ?? 'RouterOS trap error');
            }

            if ($reply === '!re') {
                $response[] = $row;
            }

            if ($reply === '!done') {
                if ($row !== []) {
                    $response[] = $row;
                }
                break;
            }
        }

        return $response;
    }

    private function readSentence(): array
    {
        $words = [];
        while (true) {
            $word = $this->readWord();
            if ($word === '') {
                break;
            }
            $words[] = $word;
        }

        return $words;
    }

    private function readWord(): string
    {
        $length = $this->readLength();
        if ($length === 0) {
            return '';
        }

        $buffer = '';
        while (strlen($buffer) < $length) {
            $chunk = fread($this->socket, $length - strlen($buffer));
            if ($chunk === false || $chunk === '') {
                throw new RuntimeException('Gagal membaca respons MikroTik.');
            }
            $buffer .= $chunk;
        }

        return $buffer;
    }

    private function writeWord(string $word): void
    {
        $length = strlen($word);
        fwrite($this->socket, $this->encodeLength($length) . $word);
    }

    private function readLength(): int
    {
        $char = ord(fread($this->socket, 1));
        if ($char < 0x80) {
            return $char;
        }
        if (($char & 0xC0) === 0x80) {
            $char &= ~0xC0;
            $char = ($char << 8) + ord(fread($this->socket, 1));
            return $char;
        }
        if (($char & 0xE0) === 0xC0) {
            $char &= ~0xE0;
            $char = ($char << 8) + ord(fread($this->socket, 1));
            $char = ($char << 8) + ord(fread($this->socket, 1));
            return $char;
        }
        if (($char & 0xF0) === 0xE0) {
            $char &= ~0xF0;
            $char = ($char << 8) + ord(fread($this->socket, 1));
            $char = ($char << 8) + ord(fread($this->socket, 1));
            $char = ($char << 8) + ord(fread($this->socket, 1));
            return $char;
        }
        if (($char & 0xF8) === 0xF0) {
            return ord(fread($this->socket, 1)) << 24
                | ord(fread($this->socket, 1)) << 16
                | ord(fread($this->socket, 1)) << 8
                | ord(fread($this->socket, 1));
        }

        throw new RuntimeException('Panjang word MikroTik tidak valid.');
    }

    private function encodeLength(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }
        if ($length < 0x4000) {
            $length |= 0x8000;
            return chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        }
        if ($length < 0x200000) {
            $length |= 0xC00000;
            return chr(($length >> 16) & 0xFF) . chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        }
        if ($length < 0x10000000) {
            $length |= 0xE0000000;
            return chr(($length >> 24) & 0xFF) . chr(($length >> 16) & 0xFF) . chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        }

        return chr(0xF0)
            . chr(($length >> 24) & 0xFF)
            . chr(($length >> 16) & 0xFF)
            . chr(($length >> 8) & 0xFF)
            . chr($length & 0xFF);
    }
}
