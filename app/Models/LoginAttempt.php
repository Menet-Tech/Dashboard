<?php

declare(strict_types=1);

namespace App\Models;

class LoginAttempt extends BaseModel
{
    public function create(string $username, string $ipAddress): void
    {
        $stmt = $this->db->prepare('INSERT INTO login_attempts (username, ip_address) VALUES (:username, :ip_address)');
        $stmt->execute([
            'username' => $username,
            'ip_address' => $ipAddress,
        ]);
    }

    public function countRecent(string $username, string $ipAddress, int $windowMinutes): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE (username = :username OR ip_address = :ip_address)
               AND attempted_at >= DATE_SUB(NOW(), INTERVAL :window MINUTE)'
        );
        $stmt->bindValue('username', $username);
        $stmt->bindValue('ip_address', $ipAddress);
        $stmt->bindValue('window', $windowMinutes, \PDO::PARAM_INT);
        $stmt->execute();

        return (int) $stmt->fetchColumn();
    }

    public function clearRecent(string $username, string $ipAddress): void
    {
        $stmt = $this->db->prepare('DELETE FROM login_attempts WHERE username = :username OR ip_address = :ip_address');
        $stmt->execute([
            'username' => $username,
            'ip_address' => $ipAddress,
        ]);
    }
}
