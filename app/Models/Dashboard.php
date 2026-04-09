<?php

declare(strict_types=1);

namespace App\Models;

class Dashboard extends BaseModel
{
    public function summary(): array
    {
        $summary = $this->db->query('SELECT * FROM view_pelanggan_summary')->fetch() ?: [];
        $tagihan = $this->db->query("SELECT
            SUM(CASE WHEN status = 'belum_bayar' THEN 1 ELSE 0 END) AS total_tunggakan,
            SUM(CASE WHEN status = 'lunas' THEN harga ELSE 0 END) AS pendapatan_lunas
            FROM tagihan")->fetch() ?: [];
        return array_merge($summary, $tagihan);
    }

    public function chartData(): array
    {
        return $this->db->query('SELECT * FROM view_pendapatan_bulanan ORDER BY bulan ASC LIMIT 12')->fetchAll();
    }
}
