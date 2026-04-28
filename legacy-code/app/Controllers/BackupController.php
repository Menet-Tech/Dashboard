<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\BackupLog;
use App\Support\DatabaseBackup;

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

        $result = DatabaseBackup::create($this->userId());
        Session::flash($result['success'] ? 'success' : 'error', $result['message']);
        redirect('/backup');
    }
}
