<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\BackupLog;
use App\Models\Pengaturan;

class BackupController extends Controller
{
    public function index(): void
    {
        $this->requireAdmin();
        $this->view('backup/index', [
            'title' => 'Backup Database',
            'rows' => (new BackupLog())->latest(),
        ]);
    }

    public function create(): void
    {
        verify_csrf();
        $this->requireAdmin();

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
            'created_by_user_id' => $this->userId(),
        ]);

        Session::flash($success ? 'success' : 'error', $success ? 'Backup database berhasil dibuat.' : 'Backup database gagal.');
        redirect('/backup');
    }
}
