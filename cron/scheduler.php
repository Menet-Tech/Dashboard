#!/usr/bin/env php
<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    Dotenv\Dotenv::createImmutable(BASE_PATH)->safeLoad();
}

date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'Asia/Jakarta');
\App\Config\Database::initialize();

$lockFile = __DIR__ . '/cron.lock';
if (file_exists($lockFile) && filemtime($lockFile) > time() - 120) {
    die('[' . date('Y-m-d H:i:s') . "] Another cron instance is running.\n");
}

file_put_contents($lockFile, (string) getmypid());

try {
    (new \App\Scheduler())->run();
    echo '[' . date('Y-m-d H:i:s') . "] Cron finished.\n";
} catch (Throwable $throwable) {
    \App\Models\Pengaturan::set('cron_last_run_at', date('Y-m-d H:i:s'));
    \App\Models\Pengaturan::set('cron_last_status', 'failed');
    (new \App\Models\SystemHealthCheck())->record('cron', 'failed', $throwable->getMessage());
    discordNotify(
        'Scheduler Gagal',
        'Cron scheduler mengalami kegagalan.',
        [['name' => 'Error', 'value' => $throwable->getMessage(), 'inline' => false]],
        'alert',
        'danger'
    );
    echo '[' . date('Y-m-d H:i:s') . '] Cron failed: ' . $throwable->getMessage() . "\n";
    throw $throwable;
} finally {
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }
}
