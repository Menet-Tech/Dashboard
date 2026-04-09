<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\Dashboard;
use App\Models\Pengaturan;

class DashboardController extends Controller
{
    public function index(): void
    {
        if (!Session::has('dashboard_heartbeat_sent')) {
            discordNotify(
                'Dashboard Aktif',
                'Dashboard web berhasil diakses dan sistem merespons normal.',
                [
                    ['name' => 'User', 'value' => (string) ((Session::get('user')['nama_lengkap'] ?? 'Petugas'))],
                    ['name' => 'Waktu', 'value' => date('d/m/Y H:i:s')],
                ],
                'alert',
                'info'
            );
            Session::set('dashboard_heartbeat_sent', true);
        }

        $this->view('dashboard/index', [
            'title' => 'Dashboard',
            'summary' => (new Dashboard())->summary(),
            'chartData' => (new Dashboard())->chartData(),
            'latestLogs' => (new ActionLog())->latest(),
            'namaIsp' => Pengaturan::get('nama_isp', 'Menet-Tech'),
        ]);
    }
}
