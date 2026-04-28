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
        $sql = "SELECT t.*, p.nama, p.no_wa, p.tgl_jatuh_tempo, p.id AS id_pelanggan, pk.nama_paket,
                    (SELECT COUNT(*) FROM tagihan t2 WHERE t2.id_pelanggan = t.id_pelanggan AND t2.status = 'belum_bayar') AS total_unpaid_count,
                    (SELECT COUNT(*) FROM tagihan t3 WHERE t3.id_pelanggan = t.id_pelanggan AND t3.periode <= t.periode) AS invoice_sequence
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
            $row['menunggak_after_days'] = (int) Pengaturan::get('billing_menunggak_after_days', '30');
            $row['display_status'] = self::computeDisplayStatus($row);
            $row['invoice_number'] = self::generateInvoiceNumber($row);
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
        $stmt = $this->db->prepare("SELECT t.*, p.nama, p.no_wa, p.user_pppoe, p.tgl_jatuh_tempo, p.id AS id_pelanggan, pk.nama_paket,
            (SELECT COUNT(*) FROM tagihan t3 WHERE t3.id_pelanggan = t.id_pelanggan AND t3.periode <= t.periode) AS invoice_sequence
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
        $row['menunggak_after_days'] = (int) Pengaturan::get('billing_menunggak_after_days', '30');
        $row['display_status'] = self::computeDisplayStatus($row);
        $row['invoice_number'] = self::generateInvoiceNumber($row);

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

    /**
     * Count the number of unpaid (belum_bayar) bills for a specific customer.
     * Used to decide whether to restore pelanggan status to 'active' after payment.
     */
    public function countUnpaidForCustomer(int $pelangganId): int
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM tagihan WHERE id_pelanggan = :id AND status = 'belum_bayar'"
        );
        $stmt->execute(['id' => $pelangganId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Compute a human-readable display status for a tagihan row.
     *
     * Rules:
     *  - 'lunas'        -> 'lunas'
     *  - 'belum_bayar'  + due date not yet passed -> 'belum_bayar'
     *  - 'belum_bayar'  + due date passed + 1 unpaid bill total  -> 'jatuh_tempo'
     *  - 'belum_bayar'  + due date passed + 2+ unpaid bills total-> 'menunggak'
     *
     * Expects $row to contain:
     *  - 'status'             : DB status string
     *  - 'tgl_jatuh_tempo'    : already-resolved due date (Y-m-d), as set by all()
     *  - 'total_unpaid_count' : subquery count from all(); defaults to 1 if missing
     */
    public static function computeDisplayStatus(array $row): string
    {
        $status = $row['status'] ?? 'belum_bayar';

        if ($status !== 'belum_bayar') {
            return $status;
        }

        $dueDate = $row['tgl_jatuh_tempo'] ?? null;
        if (!$dueDate || $dueDate > date('Y-m-d')) {
            return 'belum_bayar';
        }

        // Past due — check how many total unpaid bills this customer has
        $daysPastDue = max(0, (int) floor((strtotime(date('Y-m-d')) - strtotime($dueDate)) / 86400));
        $menunggakAfterDays = max(1, (int) ($row['menunggak_after_days'] ?? 30));

        return $daysPastDue >= $menunggakAfterDays ? 'menunggak' : 'jatuh_tempo';
    }

    /**
     * Map a display status to a Bootstrap badge colour class.
     */
    public static function displayStatusBadge(string $displayStatus): string
    {
        return match ($displayStatus) {
            'lunas'       => 'success',
            'jatuh_tempo' => 'warning',
            'menunggak'   => 'danger',
            default       => 'secondary',   // belum_bayar / menunggu_wa
        };
    }

    /**
     * Map a display status to a human-readable Indonesian label.
     */
    public static function displayStatusLabel(string $displayStatus): string
    {
        return match ($displayStatus) {
            'lunas'       => 'Lunas',
            'jatuh_tempo' => 'Jatuh Tempo',
            'menunggak'   => 'Menunggak',
            'menunggu_wa' => 'Menunggu WA',
            default       => 'Belum Bayar',
        };
    }

    public static function generateInvoiceNumber(array $row): string
    {
        $dateSource = (string) (($row['tgl_bayar'] ?? null) ?: ($row['tgl_tagihan'] ?? ($row['periode'] ?? date('Y-m-01'))));
        $datePart = date('d-m-Y', strtotime($dateSource));
        $customerId = (int) ($row['id_pelanggan'] ?? 0);
        $speed = self::extractPackageSpeed((string) ($row['nama_paket'] ?? ''));
        $sequence = str_pad((string) max(1, (int) ($row['invoice_sequence'] ?? 1)), 3, '0', STR_PAD_LEFT);

        return "{$datePart}/{$customerId}/{$speed}/{$sequence}";
    }

    public static function extractPackageSpeed(string $packageName): string
    {
        if (preg_match('/(\d+)/', $packageName, $matches) === 1) {
            return $matches[1];
        }

        return 'NA';
    }
}
