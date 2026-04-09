<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\Dashboard;
use App\Models\MikroTikAPI;
use App\Models\Pengaturan;
use App\Models\Tagihan;
use App\Models\WhatsAppAPI;

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
            'serviceStatuses' => [
                'wa' => (new WhatsAppAPI())->checkHealth(false),
                'mikrotik' => (new MikroTikAPI())->testConnection(Pengaturan::get('mikrotik_test_username'), false),
                'discordBot' => [
                    'success' => str_contains(strtolower(Pengaturan::get('discord_bot_status_last_check', '')), 'online'),
                    'message' => Pengaturan::get('discord_bot_status_last_check', 'Belum ada heartbeat'),
                ],
                'cron' => [
                    'success' => Pengaturan::get('cron_last_status', '') === 'success',
                    'message' => Pengaturan::get('cron_last_run_at', 'Belum pernah'),
                ],
            ],
            'latestUnpaid' => (new Tagihan())->latestUnpaid(),
        ]);
    }
}
