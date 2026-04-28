<?php

declare(strict_types=1);

namespace App\Models;

class BackupLog extends BaseModel
{
    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO backup_logs (filename, file_path, status, size_bytes, message, created_by_user_id)
             VALUES (:filename, :file_path, :status, :size_bytes, :message, :created_by_user_id)'
        );
        $stmt->execute($data);
    }

    public function latest(int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            'SELECT b.*, u.nama_lengkap
             FROM backup_logs b
             LEFT JOIN users u ON u.id = b.created_by_user_id
             ORDER BY b.created_at DESC
             LIMIT :limit'
        );
        $stmt->bindValue('limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
