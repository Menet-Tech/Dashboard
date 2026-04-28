<?php

declare(strict_types=1);

namespace App\Models;

class Report extends BaseModel
{
    public function monthlyIncome(int $months = 12): array
    {
        $stmt = $this->db->prepare(
            'SELECT DATE_FORMAT(periode, "%Y-%m") AS bulan,
                    COUNT(*) AS total_tagihan,
                    SUM(CASE WHEN status = "lunas" THEN harga ELSE 0 END) AS pendapatan_terkumpul,
                    SUM(harga) AS potensi_pendapatan
             FROM tagihan
             GROUP BY DATE_FORMAT(periode, "%Y-%m")
             ORDER BY bulan DESC
             LIMIT :months'
        );
        $stmt->bindValue('months', $months, \PDO::PARAM_INT);
        $stmt->execute();

        return array_reverse($stmt->fetchAll());
    }

    public function outstandingCustomers(): array
    {
        $sql = 'SELECT p.id, p.nama, p.no_wa, p.user_pppoe, pk.nama_paket,
                       COUNT(t.id) AS total_tunggakan,
                       SUM(t.harga) AS total_nominal
                FROM pelanggan p
                JOIN paket pk ON pk.id = p.id_paket
                JOIN tagihan t ON t.id_pelanggan = p.id AND t.status = "belum_bayar"
                WHERE p.deleted_at IS NULL
                GROUP BY p.id, p.nama, p.no_wa, p.user_pppoe, pk.nama_paket
                ORDER BY total_nominal DESC, total_tunggakan DESC';

        return $this->db->query($sql)->fetchAll();
    }

    public function dueThisWeek(): array
    {
        $rows = (new Pelanggan())->all();

        return array_values(array_filter($rows, static function (array $row): bool {
            $diff = (new \DateTimeImmutable(date('Y-m-d')))->diff(new \DateTimeImmutable($row['due_date']))->format('%r%a');
            return (int) $diff >= 0 && (int) $diff <= 7;
        }));
    }

    public function longestOverdue(): array
    {
        $sql = 'SELECT p.id, p.nama, p.user_pppoe, p.no_wa, pk.nama_paket,
                       MIN(t.periode) AS tagihan_tertua,
                       COUNT(t.id) AS jumlah_tagihan,
                       SUM(t.harga) AS total_nominal
                FROM pelanggan p
                JOIN paket pk ON pk.id = p.id_paket
                JOIN tagihan t ON t.id_pelanggan = p.id AND t.status = "belum_bayar"
                WHERE p.deleted_at IS NULL
                GROUP BY p.id, p.nama, p.user_pppoe, p.no_wa, pk.nama_paket
                ORDER BY tagihan_tertua ASC, total_nominal DESC';

        return $this->db->query($sql)->fetchAll();
    }
}
