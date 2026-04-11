<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\MikroTikAPI;
use App\Models\Pengaturan;
use App\Models\SystemHealthCheck;
use App\Models\WhatsAppAPI;
use App\Support\ServiceStatus;

class MonitoringController extends Controller
{
    public function index(): void
    {
        $this->requireAdmin();
        $healthChecks = (new SystemHealthCheck())->latestMap();

        $this->view('monitoring/index', [
            'title' => 'Monitoring',
            'statuses' => $this->buildStatuses($healthChecks),
            'healthChecks' => array_values($healthChecks),
            'recentErrors' => (new ActionLog())->recentErrors(),
        ]);
    }

    public function refresh(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $waHealth = (new WhatsAppAPI())->checkHealth();
        $mikrotikHealth = (new MikroTikAPI())->testConnection(Pengaturan::get('mikrotik_test_username'));
        $discordBotLastStatus = Pengaturan::get('discord_bot_status_last_check', 'Belum ada heartbeat Discord bot');

        (new SystemHealthCheck())->record(
            'discord_bot',
            str_contains(strtolower($discordBotLastStatus), 'online') ? 'ok' : 'warning',
            $discordBotLastStatus
        );

        $successCount = 0;
        foreach ([$waHealth, $mikrotikHealth] as $result) {
            if ($result['success']) {
                $successCount++;
            }
        }
        if (str_contains(strtolower($discordBotLastStatus), 'online')) {
            $successCount++;
        }

        Session::flash(
            $successCount >= 2 ? 'success' : 'error',
            "Refresh monitoring selesai. Layanan sehat: {$successCount}/3."
        );
        redirect('/monitoring');
    }

    private function buildStatuses(array $healthChecks): array
    {
        return [
            'wa_gateway' => ServiceStatus::snapshot(
                Pengaturan::get('wa_status_panel_last_check', ''),
                $healthChecks['wa_gateway'] ?? null,
                'Belum ada pengecekan WA Gateway'
            ),
            'mikrotik' => ServiceStatus::snapshot(
                Pengaturan::get('mikrotik_status_panel_last_check', ''),
                $healthChecks['mikrotik'] ?? null,
                'Belum ada pengecekan MikroTik'
            ),
            'discord_bot' => ServiceStatus::snapshot(
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
