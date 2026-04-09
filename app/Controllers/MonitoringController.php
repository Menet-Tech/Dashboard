<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Models\ActionLog;
use App\Models\MikroTikAPI;
use App\Models\Pengaturan;
use App\Models\SystemHealthCheck;
use App\Models\WhatsAppAPI;

class MonitoringController extends Controller
{
    public function index(): void
    {
        $this->requireAdmin();

        $waHealth = (new WhatsAppAPI())->checkHealth(false);
        $mikrotikHealth = (new MikroTikAPI())->testConnection(Pengaturan::get('mikrotik_test_username'), false);
        $discordBotLastStatus = Pengaturan::get('discord_bot_status_last_check', 'Belum ada heartbeat');

        (new SystemHealthCheck())->record('wa_gateway', $waHealth['success'] ? 'ok' : 'failed', $waHealth['message']);
        (new SystemHealthCheck())->record('discord_bot', str_contains(strtolower($discordBotLastStatus), 'online') ? 'ok' : 'warning', $discordBotLastStatus);

        $this->view('monitoring/index', [
            'title' => 'Monitoring',
            'statuses' => [
                'wa_gateway' => $waHealth,
                'mikrotik' => $mikrotikHealth,
                'discord_bot' => [
                    'success' => str_contains(strtolower($discordBotLastStatus), 'online'),
                    'message' => $discordBotLastStatus,
                ],
                'cron' => [
                    'success' => Pengaturan::get('cron_last_status', '') === 'success',
                    'message' => 'Last run: ' . (Pengaturan::get('cron_last_run_at', 'Belum pernah')),
                ],
            ],
            'healthChecks' => (new SystemHealthCheck())->latestByService(),
            'recentErrors' => (new ActionLog())->recentErrors(),
        ]);
    }
}
