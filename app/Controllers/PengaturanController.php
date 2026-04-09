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
            'backup_retention_days' => 'Retensi backup otomatis',
        ];

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
                'danger'
            );
        }

        redirect('/pengaturan');
    }

    public function testDiscord(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $webhook = Pengaturan::get('discord_alert_url') ?: Pengaturan::get('discord_billing_url');
        if (!$webhook) {
            Session::flash('error', 'Isi dulu Discord webhook URL di pengaturan.');
            redirect('/pengaturan');
        }

        $message = 'Test Discord webhook dari panel pengaturan Menet-Tech pada ' . date('d/m/Y H:i:s');
        $success = sendDiscord($webhook, $message);
        ActionLog::create(null, 'DISCORD_TEST', $success ? 'success' : 'failed', $success ? 'Discord test sent' : 'Discord webhook test failed');

        Session::flash($success ? 'success' : 'error', $success
            ? 'Test Discord berhasil dikirim.'
            : 'Test Discord gagal. Periksa webhook URL dan koneksi server.');
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
                'danger'
            );
        }

        Session::flash($result['success'] ? 'success' : 'error', $result['message']);
        redirect('/pengaturan');
    }
}
