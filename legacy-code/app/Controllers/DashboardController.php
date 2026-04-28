<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\Dashboard;
use App\Models\Pengaturan;
use App\Models\SystemHealthCheck;
use App\Models\Tagihan;
use App\Support\ServiceStatus;

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
                'info',
                'dashboard_heartbeat'
            );
            Session::set('dashboard_heartbeat_sent', true);
        }

        $healthChecks = (new SystemHealthCheck())->latestMap();

        $this->view('dashboard/index', [
            'title' => 'Dashboard',
            'summary' => (new Dashboard())->summary(),
            'chartData' => (new Dashboard())->chartData(),
            'latestLogs' => (new ActionLog())->latest(),
            'namaIsp' => Pengaturan::get('nama_isp', 'Menet-Tech'),
            'serviceStatuses' => $this->cachedServiceStatuses($healthChecks),
            'latestUnpaid' => (new Tagihan())->latestUnpaid(),
        ]);
    }

    private function cachedServiceStatuses(array $healthChecks): array
    {
        return [
            'wa' => ServiceStatus::snapshot(
                Pengaturan::get('wa_status_panel_last_check', ''),
                $healthChecks['wa_gateway'] ?? null,
                'Belum ada pengecekan WA Gateway'
            ),
            'mikrotik' => ServiceStatus::snapshot(
                Pengaturan::get('mikrotik_status_panel_last_check', ''),
                $healthChecks['mikrotik'] ?? null,
                'Belum ada pengecekan MikroTik'
            ),
            'discordBot' => ServiceStatus::snapshot(
                Pengaturan::get('discord_bot_status_last_check', ''),
                $healthChecks['discord_bot'] ?? null,
                'Belum ada heartbeat Discord bot'
            ),
            'cron' => [
                'success' => Pengaturan::get('cron_last_status', '') === 'success',
                'message' => 'Last run: ' . Pengaturan::get('cron_last_run_at', 'Belum pernah'),
            ],
        ];
    }
}
