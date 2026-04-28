<?php

declare(strict_types=1);

namespace App\Config;

use PDO;
use PDOException;
use RuntimeException;

class Database
{
    private static ?PDO $connection = null;

    public static function initialize(): void
    {
        self::getConnection();
    }

    public static function getConnection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $host = $_ENV['DB_HOST'] ?? '127.0.0.1';
        $port = $_ENV['DB_PORT'] ?? '3306';
        $db = $_ENV['DB_NAME'] ?? 'dashboard';
        $user = $_ENV['DB_USER'] ?? 'root';
        $pass = $_ENV['DB_PASS'] ?? '';

        $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

        try {
            self::$connection = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $exception) {
            if (defined('PHPUNIT_RUNNING')) {
                throw new RuntimeException('Database connection failed for tests: ' . $exception->getMessage(), 0, $exception);
            }
            http_response_code(500);
            echo 'Database connection failed: ' . htmlspecialchars($exception->getMessage(), ENT_QUOTES, 'UTF-8');
            exit;
        }

        return self::$connection;
    }
}
