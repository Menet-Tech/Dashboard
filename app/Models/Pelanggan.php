<?php

declare(strict_types=1);

namespace App\Models;

class Pelanggan extends BaseModel
{
    public static function normalizeDueDay(int $day): string
    {
        $day = max(1, min(31, $day));

        return sprintf('2000-01-%02d', $day);
    }

    public static function extractDueDay(?string $storedDate): int
    {
        if (!$storedDate) {
            return 1;
        }

        return (int) date('j', strtotime($storedDate));
    }

    public static function resolveDueDateForPeriod(int $dueDay, ?string $period = null): string
    {
        $base = $period ? date('Y-m-01', strtotime($period)) : date('Y-m-01');
        $year = (int) date('Y', strtotime($base));
        $month = (int) date('m', strtotime($base));
        $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $month, $year);
        $effectiveDay = min(max(1, $dueDay), $daysInMonth);

        return sprintf('%04d-%02d-%02d', $year, $month, $effectiveDay);
    }

    public static function resolveDueDateFromStored(?string $storedDate, ?string $period = null): string
    {
        return self::resolveDueDateForPeriod(self::extractDueDay($storedDate), $period);
    }

    public function all(string $keyword = ''): array
    {
        $sql = 'SELECT p.*, pk.nama_paket, pk.harga FROM pelanggan p JOIN paket pk ON pk.id = p.id_paket WHERE p.deleted_at IS NULL';
        $params = [];
        if ($keyword !== '') {
            $sql .= ' AND (p.nama LIKE :keyword OR p.user_pppoe LIKE :keyword OR p.no_wa LIKE :keyword)';
            $params['keyword'] = '%' . $keyword . '%';
        }
        $sql .= ' ORDER BY p.created_at DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return array_map([$this, 'hydrateDerivedDates'], $stmt->fetchAll());
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM pelanggan WHERE id = :id AND deleted_at IS NULL LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row ? $this->hydrateDerivedDates($row) : null;
    }

    public function findDetailed(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT p.*, pk.nama_paket, pk.harga, pk.profile_mikrotik, pk.profile_limit_mikrotik
             FROM pelanggan p
             JOIN paket pk ON pk.id = p.id_paket
             WHERE p.id = :id AND p.deleted_at IS NULL
             LIMIT 1"
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row ? $this->hydrateDerivedDates($row) : null;
    }

    public function save(array $data): void
    {
        if (!empty($data['id'])) {
            $stmt = $this->db->prepare(
                'UPDATE pelanggan SET id_paket = :id_paket, nama = :nama, user_pppoe = :user_pppoe, pass_pppoe = :pass_pppoe,
                no_wa = :no_wa, sn_ont = :sn_ont, latitude = :latitude, longitude = :longitude, alamat = :alamat,
                tgl_jatuh_tempo = :tgl_jatuh_tempo, status = :status WHERE id = :id'
            );
            $stmt->execute($data);
            return;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO pelanggan (id_paket, nama, user_pppoe, pass_pppoe, no_wa, sn_ont, latitude, longitude, alamat, tgl_jatuh_tempo, status)
             VALUES (:id_paket, :nama, :user_pppoe, :pass_pppoe, :no_wa, :sn_ont, :latitude, :longitude, :alamat, :tgl_jatuh_tempo, :status)'
        );
        $insertData = $data;
        unset($insertData['id']);
        $stmt->execute($insertData);
    }

    public function softDelete(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE pelanggan SET deleted_at = NOW(), status = 'inactive' WHERE id = :id");
        $stmt->execute(['id' => $id]);
    }

    public function existsUserPppoe(string $username, ?int $ignoreId = null): bool
    {
        $sql = 'SELECT COUNT(*) FROM pelanggan WHERE user_pppoe = :username AND deleted_at IS NULL';
        $params = ['username' => $username];
        if ($ignoreId) {
            $sql .= ' AND id != :id';
            $params['id'] = $ignoreId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    public function allMapData(): array
    {
        $sql = "SELECT p.*, pk.nama_paket,
                CASE
                    WHEN p.status = 'limit' THEN 'red'
                    WHEN p.status = 'inactive' THEN 'gray'
                    ELSE 'green'
                END AS marker_color
                FROM pelanggan p
                JOIN paket pk ON pk.id = p.id_paket
                WHERE p.deleted_at IS NULL
                ORDER BY p.nama ASC";
        $rows = $this->db->query($sql)->fetchAll();

        return array_map(function (array $row): array {
            $row = $this->hydrateDerivedDates($row);
            if (($row['status'] ?? '') === 'active' && $this->daysUntilDueDate($row['due_date']) <= 7 && $this->daysUntilDueDate($row['due_date']) >= 0) {
                $row['marker_color'] = 'yellow';
            }

            return $row;
        }, $rows);
    }

    public function getJatuhTempo(): array
    {
        $sql = "SELECT p.*, pk.profile_limit_mikrotik, pk.nama_paket, pk.harga
                FROM pelanggan p
                JOIN paket pk ON pk.id = p.id_paket
                WHERE p.status = 'active' AND p.deleted_at IS NULL";
        $rows = $this->db->query($sql)->fetchAll();

        return array_values(array_filter(array_map([$this, 'hydrateDerivedDates'], $rows), function (array $row): bool {
            return strtotime($row['due_date']) < strtotime(date('Y-m-d'));
        }));
    }

    public function getReminder7Hari(): array
    {
        $sql = "SELECT p.*, pk.nama_paket, pk.harga
                FROM pelanggan p
                JOIN paket pk ON pk.id = p.id_paket
                WHERE p.status = 'active' AND p.deleted_at IS NULL";
        $rows = $this->db->query($sql)->fetchAll();

        return array_values(array_filter(array_map([$this, 'hydrateDerivedDates'], $rows), function (array $row): bool {
            return $this->daysUntilDueDate($row['due_date']) === 7;
        }));
    }

    public function updateStatus(int $id, string $status): void
    {
        $stmt = $this->db->prepare('UPDATE pelanggan SET status = :status WHERE id = :id');
        $stmt->execute(['status' => $status, 'id' => $id]);
    }

    private function hydrateDerivedDates(array $row): array
    {
        $dueDay = self::extractDueDay($row['tgl_jatuh_tempo'] ?? null);
        $period = $row['periode'] ?? null;
        $resolvedDueDate = self::resolveDueDateForPeriod($dueDay, $period);

        $row['due_day'] = $dueDay;
        $row['due_date'] = $resolvedDueDate;
        $row['tgl_jatuh_tempo_display'] = $resolvedDueDate;

        return $row;
    }

    private function daysUntilDueDate(string $dueDate): int
    {
        $today = new \DateTimeImmutable(date('Y-m-d'));
        $target = new \DateTimeImmutable($dueDate);

        return (int) $today->diff($target)->format('%r%a');
    }
}
