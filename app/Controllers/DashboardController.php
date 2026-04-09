<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Models\ActionLog;
use App\Models\Dashboard;
use App\Models\Pengaturan;

class DashboardController extends Controller
{
    public function index(): void
    {
        $this->view('dashboard/index', [
            'title' => 'Dashboard',
            'summary' => (new Dashboard())->summary(),
            'chartData' => (new Dashboard())->chartData(),
            'latestLogs' => (new ActionLog())->latest(),
            'namaIsp' => Pengaturan::get('nama_isp', 'Menet-Tech'),
        ]);
    }
}
