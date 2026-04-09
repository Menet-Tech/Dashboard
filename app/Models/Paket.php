<?php

declare(strict_types=1);

namespace App\Models;

class Paket extends BaseModel
{
    public function all(): array
    {
        return $this->db->query('SELECT * FROM paket ORDER BY nama_paket ASC')->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM paket WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function save(array $data): void
    {
        if (!empty($data['id'])) {
            $stmt = $this->db->prepare('UPDATE paket SET nama_paket = :nama_paket, harga = :harga, profile_mikrotik = :profile_mikrotik, profile_limit_mikrotik = :profile_limit_mikrotik WHERE id = :id');
            $stmt->execute($data);
            return;
        }

        $stmt = $this->db->prepare('INSERT INTO paket (nama_paket, harga, profile_mikrotik, profile_limit_mikrotik) VALUES (:nama_paket, :harga, :profile_mikrotik, :profile_limit_mikrotik)');
        $stmt->execute($data);
    }

    public function isUsed(int $id): bool
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM pelanggan WHERE id_paket = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn() > 0;
    }

    public function delete(int $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM paket WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }
}
