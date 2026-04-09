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
} finally {
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }
}
