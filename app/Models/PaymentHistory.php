<?php

declare(strict_types=1);

namespace App\Models;

class PaymentHistory extends BaseModel
{
    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO payment_history
            (tagihan_id, id_pelanggan, metode_bayar, jumlah_bayar, dibayar_pada, catatan, bukti_pembayaran, created_by_user_id)
            VALUES
            (:tagihan_id, :id_pelanggan, :metode_bayar, :jumlah_bayar, :dibayar_pada, :catatan, :bukti_pembayaran, :created_by_user_id)'
        );
        $stmt->execute($data);
    }

    public function byBill(int $tagihanId): array
    {
        $stmt = $this->db->prepare(
            'SELECT ph.*, u.nama_lengkap
             FROM payment_history ph
             LEFT JOIN users u ON u.id = ph.created_by_user_id
             WHERE ph.tagihan_id = :tagihan_id
             ORDER BY ph.dibayar_pada DESC, ph.id DESC'
        );
        $stmt->execute(['tagihan_id' => $tagihanId]);

        return $stmt->fetchAll();
    }
}
