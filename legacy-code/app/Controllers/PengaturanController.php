<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\MikroTikAPI;
use App\Models\Pengaturan;
use App\Models\WhatsAppAPI;

class PengaturanController extends Controller
{
    public function index(): void
    {
        $this->requireAdmin();
        $this->view('pengaturan/index', [
            'title' => 'Pengaturan',
            'rows' => (new Pengaturan())->all(),
        ]);
    }

    public function save(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $descriptions = [
            'nama_isp' => 'Nama ISP yang ditampilkan di header',
            'no_rekening' => 'Informasi rekening pembayaran',
            'wa_gateway_url' => 'Base URL WhatsApp Gateway Internal',
            'wa_api_key' => 'API Key WhatsApp Gateway Internal',
            'wa_account_id' => 'Default account ID WA Gateway',
            'wa_fallback_wa_me' => 'Fallback ke wa.me jika gateway gagal',
            'wa_test_number' => 'Nomor tujuan untuk tes WhatsApp',
            'discord_billing_url' => 'Webhook billing Discord',
            'discord_alert_url' => 'Webhook alert Discord',
            'discord_bot_token' => 'Token bot Discord',
            'discord_application_id' => 'Application ID Discord bot',
            'discord_guild_id' => 'Guild ID Discord untuk register slash command',
            'mikrotik_host' => 'Host API MikroTik',
            'mikrotik_port' => 'Port API MikroTik',
            'mikrotik_user' => 'Username API MikroTik',
            'mikrotik_pass' => 'Password API MikroTik',
            'mikrotik_test_username' => 'Username dummy untuk tes MikroTik',
            'billing_auto_generate_enabled' => 'Aktifkan generate tagihan otomatis bulanan',
            'billing_auto_generate_day' => 'Hari generate tagihan otomatis',
            'billing_auto_generate_time' => 'Jam generate tagihan otomatis',
            'billing_limit_after_days' => 'Jumlah hari setelah jatuh tempo sebelum pelanggan dilimit',
            'billing_menunggak_after_days' => 'Jumlah hari setelah jatuh tempo sebelum status menjadi menunggak',
            'billing_reminder_days_before' => 'Jumlah hari sebelum jatuh tempo untuk reminder otomatis',
            'backup_auto_enabled' => 'Aktifkan backup database otomatis',
            'backup_auto_time' => 'Jam backup database otomatis',
            'backup_retention_days' => 'Retensi backup otomatis',
        ];

        foreach (discordAlertPreferenceDefinitions() as $eventKey => $definition) {
            $descriptions[discordAlertPreferenceKey($eventKey)] = $definition['description'];
        }

        $rows = [];
        foreach ($descriptions as $key => $description) {
            $rows[$key] = [
                'value' => trim((string) $this->input($key, '')),
                'description' => $description,
            ];
        }

        (new Pengaturan())->saveMany($rows);
        Session::flash('success', 'Pengaturan berhasil diperbarui.');
        redirect('/pengaturan');
    }

    public function testWhatsapp(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $targetNumber = preg_replace('/\D+/', '', (string) Pengaturan::get('wa_test_number', ''));
        if ($targetNumber === '') {
            Session::flash('error', 'Isi dulu nomor tujuan test WhatsApp di pengaturan.');
            redirect('/pengaturan');
        }

        $message = 'Test WhatsApp dari panel pengaturan Menet-Tech pada ' . date('d/m/Y H:i:s');
        $result = (new WhatsAppAPI())->sendText($targetNumber, $message);
        ActionLog::create(null, 'WA_TEST', $result['success'] ? 'success' : 'failed', $result['error'] ?? ($result['message_id'] ?? 'WA test sent'));

        if ($result['success']) {
            Session::flash('success', 'Pesan test WhatsApp berhasil dikirim.');
        } else {
            $extra = !empty($result['fallback_url']) ? ' Fallback wa.me tersedia.' : '';
            Session::flash('error', 'Test WhatsApp gagal: ' . ($result['error'] ?? 'Unknown error') . $extra);
            discordNotify(
                'Test WhatsApp Gagal',
                'Pengujian WhatsApp dari halaman pengaturan gagal.',
                [['name' => 'Detail', 'value' => $result['error'] ?? 'Unknown error', 'inline' => false]],
                'alert',
                'danger',
                'wa_failed'
            );
        }

        redirect('/pengaturan');
    }

    public function testDiscord(): void
    {
        verify_csrf();
        $this->requireAdmin();

        if (!Pengaturan::get('discord_alert_url') && !Pengaturan::get('discord_billing_url')) {
            Session::flash('error', 'Isi dulu Discord webhook URL di pengaturan.');
            redirect('/pengaturan');
        }

        $response = discordBroadcast(
            'Test Discord Webhook',
            'Tes webhook dikirim dari halaman pengaturan Menet-Tech.',
            [
                ['name' => 'Waktu', 'value' => date('d/m/Y H:i:s')],
                ['name' => 'Operator', 'value' => (string) ($this->user()['nama_lengkap'] ?? 'Admin')],
            ],
            ['alert', 'billing'],
            'info'
        );

        $attempted = $response['attempted'];
        $successCount = $response['success_count'];
        $detail = implode(', ', array_map(
            static fn (array $result): string => $result['channel'] . ':' . ($result['success'] ? 'ok' : ($result['configured'] ? 'failed' : 'missing')),
            $response['results']
        ));

        ActionLog::create(null, 'DISCORD_TEST', $response['success'] ? 'success' : 'failed', $detail);

        if ($attempted === 0) {
            Session::flash('error', 'Webhook Discord belum lengkap. Isi minimal salah satu URL alert atau billing.');
        } elseif ($successCount === $attempted) {
            Session::flash('success', "Test Discord berhasil dikirim ke {$successCount} webhook.");
        } elseif ($successCount > 0) {
            Session::flash('success', "Sebagian webhook berhasil: {$successCount}/{$attempted}. Cek URL yang gagal.");
        } else {
            Session::flash('error', 'Test Discord gagal ke semua webhook. Periksa URL dan koneksi server.');
        }

        redirect('/pengaturan');
    }

    public function testMikrotik(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $testUsername = trim((string) Pengaturan::get('mikrotik_test_username', ''));
        $result = (new MikroTikAPI())->testConnection($testUsername !== '' ? $testUsername : null);
        if (!$result['success']) {
            discordNotify(
                'Test MikroTik Gagal',
                'Pengujian MikroTik dari halaman pengaturan gagal.',
                [['name' => 'Detail', 'value' => $result['message'], 'inline' => false]],
                'alert',
                'danger',
                'mikrotik_failed'
            );
        }

        Session::flash($result['success'] ? 'success' : 'error', $result['message']);
        redirect('/pengaturan');
    }
}
