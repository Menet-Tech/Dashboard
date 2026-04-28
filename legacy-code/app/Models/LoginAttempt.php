<?php

declare(strict_types=1);

namespace App\Models;

class LoginAttempt extends BaseModel
{
    private function ensureTableExists(): void
    {
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS `login_attempts` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `username` VARCHAR(50) NOT NULL,
                `ip_address` VARCHAR(45) NOT NULL,
                `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_username_attempted_at` (`username`, `attempted_at`),
                KEY `idx_ip_attempted_at` (`ip_address`, `attempted_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    public function create(string $username, string $ipAddress): void
    {
        $this->ensureTableExists();

        $stmt = $this->db->prepare('INSERT INTO login_attempts (username, ip_address) VALUES (:username, :ip_address)');
        $stmt->execute([
            'username' => $username,
            'ip_address' => $ipAddress,
        ]);
    }

    public function countRecent(string $username, string $ipAddress, int $windowMinutes): int
    {
        $this->ensureTableExists();

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
        $this->ensureTableExists();

        $stmt = $this->db->prepare('DELETE FROM login_attempts WHERE username = :username OR ip_address = :ip_address');
        $stmt->execute([
            'username' => $username,
            'ip_address' => $ipAddress,
        ]);
    }
}
