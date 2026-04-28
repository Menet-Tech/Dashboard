<?php

declare(strict_types=1);

use App\Config\Database;
use App\Core\Router;
use App\Core\Session;

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

$dotenvPath = BASE_PATH . '/.env';
if (file_exists($dotenvPath)) {
    Dotenv\Dotenv::createImmutable(BASE_PATH)->safeLoad();
}

date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'Asia/Jakarta');

if (($_ENV['APP_DEBUG'] ?? 'false') === 'true') {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
    error_reporting(E_ALL);
}

Session::start();
Database::initialize();

$router = new Router();
require BASE_PATH . '/routes.php';

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
} catch (\Throwable $exception) {
    http_response_code(500);
    $message = sprintf('%s in %s on line %d', $exception->getMessage(), $exception->getFile(), $exception->getLine());
    if (($_ENV['APP_DEBUG'] ?? 'false') === 'true') {
        echo '<pre>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . "\n\n" . htmlspecialchars($exception->getTraceAsString(), ENT_QUOTES, 'UTF-8') . '</pre>';
    } else {
        $logDir = BASE_PATH . '/storage/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }
        $logFile = $logDir . '/error.log';
        @file_put_contents($logFile, date('Y-m-d H:i:s') . ' ' . $message . "\n" . $exception->getTraceAsString() . "\n\n", FILE_APPEND);
        echo 'Internal Server Error';
    }
}
