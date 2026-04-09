<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    Dotenv\Dotenv::createImmutable(BASE_PATH)->safeLoad();
}

date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'Asia/Jakarta');

$pdo = \App\Config\Database::getConnection();
$pdo->exec("CREATE TABLE IF NOT EXISTS migrations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename VARCHAR(191) NOT NULL,
    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY idx_filename (filename)
)");

$migrationDir = __DIR__ . '/migrations';
$files = glob($migrationDir . '/*.sql') ?: [];
sort($files);

foreach ($files as $file) {
    $filename = basename($file);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM migrations WHERE filename = :filename');
    $stmt->execute(['filename' => $filename]);

    if ((int) $stmt->fetchColumn() > 0) {
        echo "[skip] {$filename}\n";
        continue;
    }

    $sql = file_get_contents($file);
    if ($sql === false) {
        throw new RuntimeException("Tidak bisa membaca migration {$filename}");
    }

    try {
        foreach (array_filter(array_map('trim', preg_split('/;\s*\n/', $sql))) as $statement) {
            if ($statement !== '') {
                $pdo->exec($statement);
            }
        }

        $insert = $pdo->prepare('INSERT INTO migrations (filename) VALUES (:filename)');
        $insert->execute(['filename' => $filename]);
        echo "[ok] {$filename}\n";
    } catch (Throwable $throwable) {
        throw $throwable;
    }
}
