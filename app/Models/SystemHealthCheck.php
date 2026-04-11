<?php

declare(strict_types=1);

namespace App\Models;

class SystemHealthCheck extends BaseModel
{
    public function record(string $service, string $status, string $message): void
    {
        $stmt = $this->db->prepare('INSERT INTO system_health_checks (service_name, status, message) VALUES (:service_name, :status, :message)');
        $stmt->execute([
            'service_name' => $service,
            'status' => $status,
            'message' => $message,
        ]);
    }

    public function latestByService(): array
    {
        $sql = "SELECT sh1.*
                FROM system_health_checks sh1
                INNER JOIN (
                    SELECT service_name, MAX(checked_at) AS max_checked_at
                    FROM system_health_checks
                    GROUP BY service_name
                ) sh2 ON sh1.service_name = sh2.service_name AND sh1.checked_at = sh2.max_checked_at
                ORDER BY sh1.service_name ASC";

        return $this->db->query($sql)->fetchAll();
    }

    public function latestMap(): array
    {
        $map = [];
        foreach ($this->latestByService() as $row) {
            $map[$row['service_name']] = $row;
        }

        return $map;
    }
}
