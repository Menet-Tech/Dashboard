<?php

declare(strict_types=1);

namespace App;

use App\Models\ActionLog;
use App\Models\MikroTikAPI;
use App\Models\Pelanggan;
use App\Models\Pengaturan;
use App\Models\Tagihan;
use App\Models\TemplateWA;
use App\Models\WhatsAppAPI;

class Scheduler
{
    public function __construct(
        private ?WhatsAppAPI $whatsApp = null,
        private ?MikroTikAPI $mikroTik = null
    ) {
        $this->whatsApp ??= new WhatsAppAPI();
        $this->mikroTik ??= new MikroTikAPI();
    }

    public function run(): void
    {
        $this->processMenungguWa();
        $this->processJatuhTempo();
        $this->processReminder7Hari();
    }

    public function processMenungguWa(): void
    {
        $tagihanModel = new Tagihan();
        foreach ($tagihanModel->getMenungguExpired() as $bill) {
            $tagihanModel->updateStatus((int) $bill['id'], 'lunas');
            $template = TemplateWA::getByTrigger('lunas');
            $message = TemplateWA::parse($template['isi_pesan'] ?? 'Pembayaran berhasil.', $bill);
            $result = $this->whatsApp->sendText((string) $bill['no_wa'], $message);
            ActionLog::create((int) $bill['id_pelanggan'], 'WA_SENT', $result['success'] ? 'success' : 'failed', $result['error'] ?? ($result['message_id'] ?? 'WA sent'));
            sendDiscord(Pengaturan::get('discord_billing_url'), "Pembayaran lunas: {$bill['nama']}");
        }
    }

    public function processJatuhTempo(): void
    {
        $pelangganModel = new Pelanggan();
        foreach ($pelangganModel->getJatuhTempo() as $customer) {
            $pelangganModel->updateStatus((int) $customer['id'], 'limit');
            $limited = $this->mikroTik->limitUser((string) $customer['user_pppoe'], (string) $customer['profile_limit_mikrotik']);
            ActionLog::create((int) $customer['id'], 'MIKROTIK_LIMIT', $limited ? 'success' : 'failed', 'Auto limit jatuh tempo');
            if ($limited) {
                $template = TemplateWA::getByTrigger('jatuh_tempo');
                $message = TemplateWA::parse($template['isi_pesan'] ?? 'Tagihan jatuh tempo.', $customer);
                $result = $this->whatsApp->sendText((string) $customer['no_wa'], $message);
                ActionLog::create((int) $customer['id'], 'WA_SENT', $result['success'] ? 'success' : 'failed', $result['error'] ?? ($result['message_id'] ?? 'WA sent'));
                sendDiscord(Pengaturan::get('discord_alert_url'), "User {$customer['nama']} dilimit otomatis.");
            }
        }
    }

    public function processReminder7Hari(): void
    {
        $pelangganModel = new Pelanggan();
        foreach ($pelangganModel->getReminder7Hari() as $customer) {
            $template = TemplateWA::getByTrigger('reminder_7hari');
            $message = TemplateWA::parse($template['isi_pesan'] ?? 'Reminder 7 hari.', $customer);
            $result = $this->whatsApp->sendText((string) $customer['no_wa'], $message);
            ActionLog::create((int) $customer['id'], 'WA_SENT', $result['success'] ? 'success' : 'failed', $result['error'] ?? 'Reminder 7 hari');
        }
    }
}
