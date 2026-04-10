<?php

declare(strict_types=1);

namespace App\Models;

class ActionLog extends BaseModel
{
    public static function create(?int $pelangganId, string $tipeAksi, string $status, ?string $pesan = null, ?int $userId = null): void
    {
        $instance = new self();
        $stmt = $instance->db->prepare(
            'INSERT INTO action_log (id_pelanggan, user_id, tipe_aksi, status, pesan, ip_address, user_agent)
             VALUES (:id_pelanggan, :user_id, :tipe_aksi, :status, :pesan, :ip_address, :user_agent)'
        );
        $stmt->execute([
            'id_pelanggan' => $pelangganId,
            'user_id' => $userId,
            'tipe_aksi' => $tipeAksi,
            'status' => $status,
            'pesan' => $pesan,
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'cli',
            'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? 'CLI', 0, 255),
        ]);
    }

    public function latest(int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            'SELECT al.*, p.nama AS nama_pelanggan
             FROM action_log al
             LEFT JOIN pelanggan p ON p.id = al.id_pelanggan
             ORDER BY al.created_at DESC
             LIMIT :limit'
        );
        $stmt->bindValue('limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function recentErrors(int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM action_log
             WHERE status = "failed"
             ORDER BY created_at DESC
             LIMIT :limit'
        );
        $stmt->bindValue('limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
