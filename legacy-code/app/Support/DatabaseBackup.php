<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\BackupLog;
use App\Models\Pengaturan;

class DatabaseBackup
{
    public static function create(?int $userId = null): array
    {
        $host = $_ENV['DB_HOST'] ?? '127.0.0.1';
        $port = $_ENV['DB_PORT'] ?? '3306';
        $database = $_ENV['DB_NAME'] ?? 'dashboard';
        $user = $_ENV['DB_USER'] ?? 'root';
        $password = $_ENV['DB_PASS'] ?? '';
        $timestamp = date('Ymd-His');
        $filename = "dashboard-backup-{$timestamp}.sql";
        $targetPath = BASE_PATH . '/storage/backups/' . $filename;
        $dumpExecutable = file_exists('D:/xampp/mysql/bin/mysqldump.exe') ? 'D:/xampp/mysql/bin/mysqldump.exe' : 'mysqldump';
        $passwordSegment = $password !== '' ? ' -p"' . $password . '"' : '';
        $command = sprintf('"%s" -h"%s" -P"%s" -u"%s"%s "%s" > "%s"', $dumpExecutable, $host, $port, $user, $passwordSegment, $database, $targetPath);

        @exec($command, $output, $exitCode);
        $success = $exitCode === 0 && file_exists($targetPath);

        (new BackupLog())->create([
            'filename' => $filename,
            'file_path' => $targetPath,
            'status' => $success ? 'success' : 'failed',
            'size_bytes' => $success ? filesize($targetPath) : null,
            'message' => $success ? 'Backup berhasil dibuat.' : 'Backup gagal. Periksa mysqldump dan kredensial database.',
            'created_by_user_id' => $userId,
        ]);

        self::pruneExpiredBackups();

        return [
            'success' => $success,
            'message' => $success ? 'Backup database berhasil dibuat.' : 'Backup database gagal.',
        ];
    }

    public static function shouldRunAutoBackup(): bool
    {
        if (Pengaturan::get('backup_auto_enabled', 'false') !== 'true') {
            return false;
        }

        $targetTime = (string) Pengaturan::get('backup_auto_time', '02:30');
        $currentTime = date('H:i');
        $today = date('Y-m-d');
        $lastRun = (string) Pengaturan::get('backup_auto_last_run_date', '');

        return $currentTime >= $targetTime && $lastRun !== $today;
    }

    public static function markAutoBackupRunToday(): void
    {
        Pengaturan::set('backup_auto_last_run_date', date('Y-m-d'), 'Tanggal backup otomatis terakhir');
    }

    private static function pruneExpiredBackups(): void
    {
        $retentionDays = max(1, (int) Pengaturan::get('backup_retention_days', '14'));
        $backupDir = BASE_PATH . '/storage/backups';
        if (!is_dir($backupDir)) {
            return;
        }

        $threshold = strtotime("-{$retentionDays} days");
        foreach (glob($backupDir . '/*.sql') ?: [] as $file) {
            if (is_file($file) && filemtime($file) !== false && filemtime($file) < $threshold) {
                @unlink($file);
            }
        }
    }
}
