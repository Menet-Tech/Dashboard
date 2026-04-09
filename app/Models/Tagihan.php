<?php

declare(strict_types=1);

namespace App\Models;

class Tagihan extends BaseModel
{
    public function generateForPeriod(string $periode): int
    {
        $normalized = date('Y-m-01', strtotime($periode . '-01'));

        $stmt = $this->db->prepare(
            "INSERT INTO tagihan (id_pelanggan, periode, tgl_tagihan, harga, status)
             SELECT p.id, :periode, NOW(), pk.harga, 'belum_bayar'
             FROM pelanggan p
             JOIN paket pk ON pk.id = p.id_paket
             WHERE p.status IN ('active', 'limit')
               AND p.deleted_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM tagihan t
                 WHERE t.id_pelanggan = p.id AND t.periode = :periode_check
               )"
        );
        $stmt->execute([
            'periode' => $normalized,
            'periode_check' => $normalized,
        ]);

        return $stmt->rowCount();
    }

    public function all(array $filters = []): array
    {
        $sql = "SELECT t.*, p.nama, p.no_wa, p.tgl_jatuh_tempo, p.id AS id_pelanggan, pk.nama_paket
                FROM tagihan t
                JOIN pelanggan p ON p.id = t.id_pelanggan
                JOIN paket pk ON pk.id = p.id_paket
                WHERE p.deleted_at IS NULL";
        $params = [];
        if (!empty($filters['status'])) {
            $sql .= ' AND t.status = :status';
            $params['status'] = $filters['status'];
        }
        if (!empty($filters['periode'])) {
            $sql .= ' AND DATE_FORMAT(t.periode, "%Y-%m") = :periode';
            $params['periode'] = $filters['periode'];
        }
        $sql .= ' ORDER BY t.periode DESC, p.nama ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return array_map(function (array $row): array {
            $row['tgl_jatuh_tempo'] = Pelanggan::resolveDueDateFromStored($row['tgl_jatuh_tempo'] ?? null, $row['periode'] ?? null);
            return $row;
        }, $stmt->fetchAll());
    }

    public function forCustomer(int $pelangganId, int $limit = 12): array
    {
        $stmt = $this->db->prepare(
            "SELECT t.*, p.tgl_jatuh_tempo, pk.nama_paket
             FROM tagihan t
             JOIN pelanggan p ON p.id = t.id_pelanggan
             JOIN paket pk ON pk.id = p.id_paket
             WHERE t.id_pelanggan = :pelanggan_id
             ORDER BY t.periode DESC
             LIMIT :limit"
        );
        $stmt->bindValue('pelanggan_id', $pelangganId, \PDO::PARAM_INT);
        $stmt->bindValue('limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return array_map(function (array $row): array {
            $row['tgl_jatuh_tempo'] = Pelanggan::resolveDueDateFromStored($row['tgl_jatuh_tempo'] ?? null, $row['periode'] ?? null);
            return $row;
        }, $stmt->fetchAll());
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare("SELECT t.*, p.nama, p.no_wa, p.user_pppoe, p.tgl_jatuh_tempo, p.id AS id_pelanggan, pk.nama_paket
            FROM tagihan t
            JOIN pelanggan p ON p.id = t.id_pelanggan
            JOIN paket pk ON pk.id = p.id_paket
            WHERE t.id = :id LIMIT 1");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        $row['tgl_jatuh_tempo'] = Pelanggan::resolveDueDateFromStored($row['tgl_jatuh_tempo'] ?? null, $row['periode'] ?? null);

        return $row;
    }

    public function markPaid(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tagihan SET status = 'lunas', tgl_bayar = NOW(), redo_expired_at = NULL WHERE id = :id");
        $stmt->execute(['id' => $id]);
    }

    public function registerPayment(int $id, array $data): void
    {
        $stmt = $this->db->prepare(
            "UPDATE tagihan
             SET status = 'lunas',
                 tgl_bayar = :tgl_bayar,
                 metode_bayar = :metode_bayar,
                 catatan_pembayaran = :catatan_pembayaran,
                 bukti_pembayaran = :bukti_pembayaran,
                 paid_by_user_id = :paid_by_user_id,
                 updated_by_user_id = :updated_by_user_id,
                 redo_expired_at = NULL
             WHERE id = :id"
        );
        $stmt->execute([
            'id' => $id,
            'tgl_bayar' => $data['tgl_bayar'],
            'metode_bayar' => $data['metode_bayar'],
            'catatan_pembayaran' => $data['catatan_pembayaran'],
            'bukti_pembayaran' => $data['bukti_pembayaran'],
            'paid_by_user_id' => $data['paid_by_user_id'],
            'updated_by_user_id' => $data['updated_by_user_id'],
        ]);
    }

    public function redo(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE tagihan SET status = 'belum_bayar', tgl_bayar = NULL, redo_expired_at = NULL WHERE id = :id");
        $stmt->execute(['id' => $id]);
    }

    public function updateStatus(int $id, string $status): void
    {
        $stmt = $this->db->prepare('UPDATE tagihan SET status = :status WHERE id = :id');
        $stmt->execute(['status' => $status, 'id' => $id]);
    }

    public function getMenungguExpired(): array
    {
        $sql = "SELECT t.*, p.nama, p.no_wa, p.tgl_jatuh_tempo, p.id AS id_pelanggan, pk.nama_paket
                FROM tagihan t
                JOIN pelanggan p ON p.id = t.id_pelanggan
                JOIN paket pk ON pk.id = p.id_paket
                WHERE t.status = 'menunggu_wa'
                  AND t.redo_expired_at IS NOT NULL
                  AND t.redo_expired_at <= NOW()";
        $rows = $this->db->query($sql)->fetchAll();

        return array_map(function (array $row): array {
            $row['tgl_jatuh_tempo'] = Pelanggan::resolveDueDateFromStored($row['tgl_jatuh_tempo'] ?? null, $row['periode'] ?? null);
            return $row;
        }, $rows);
    }

    public function latestUnpaid(int $limit = 10): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, p.nama, pk.nama_paket
             FROM tagihan t
             JOIN pelanggan p ON p.id = t.id_pelanggan
             JOIN paket pk ON pk.id = p.id_paket
             WHERE t.status = "belum_bayar"
             ORDER BY t.periode ASC, t.created_at ASC
             LIMIT :limit'
        );
        $stmt->bindValue('limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
