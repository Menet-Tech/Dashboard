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

Session::start();
Database::initialize();

$router = new Router();
require BASE_PATH . '/routes.php';

$router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
