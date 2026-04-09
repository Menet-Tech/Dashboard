<?php

declare(strict_types=1);

namespace App\Models;

class User extends BaseModel
{
    public function all(): array
    {
        return $this->db->query('SELECT id, username, nama_lengkap, role, is_active, last_login, created_at FROM users ORDER BY nama_lengkap ASC')->fetchAll();
    }

    public function findByUsername(string $username): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE username = :username AND is_active = 1 LIMIT 1');
        $stmt->execute(['username' => $username]);
        $user = $stmt->fetch();

        return $user ?: null;
    }

    public function updateLastLogin(int $id): void
    {
        $stmt = $this->db->prepare('UPDATE users SET last_login = NOW() WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO users (username, password_hash, nama_lengkap, role, is_active, password_updated_at)
             VALUES (:username, :password_hash, :nama_lengkap, :role, :is_active, NOW())'
        );
        $stmt->execute($data);
    }
}
