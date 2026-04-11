<?php

declare(strict_types=1);

namespace App;

use App\Models\ActionLog;
use App\Models\MikroTikAPI;
use App\Models\Pelanggan;
use App\Models\Pengaturan;
use App\Models\PaymentHistory;
use App\Models\SystemHealthCheck;
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
        $this->processMonthlyBilling();
        $this->checkIntegrations();
        $this->processMenungguWa();
        $this->processJatuhTempo();
        $this->processReminder7Hari();
        Pengaturan::set('cron_last_run_at', date('Y-m-d H:i:s'));
        Pengaturan::set('cron_last_status', 'success');
        (new SystemHealthCheck())->record('cron', 'ok', 'Scheduler berjalan normal');
    }

    public function processMonthlyBilling(): void
    {
        if (Pengaturan::get('billing_auto_generate_enabled', 'true') !== 'true') {
            return;
        }

        $targetDay = (int) Pengaturan::get('billing_auto_generate_day', '1');
        $targetTime = (string) Pengaturan::get('billing_auto_generate_time', '00:05');
        $currentDay = (int) date('j');
        $currentTime = date('H:i');

        if ($currentDay !== $targetDay || $currentTime < $targetTime) {
            return;
        }

        $periode = date('Y-m');
        $created = (new Tagihan())->generateForPeriod($periode);
        ActionLog::create(null, 'AUTO_GENERATE_TAGIHAN', 'success', "Generate otomatis periode {$periode}: {$created} tagihan");

        discordNotify(
            'Generate Tagihan Otomatis',
            'Scheduler menjalankan generate tagihan otomatis bulanan.',
            [
                ['name' => 'Periode', 'value' => $periode],
                ['name' => 'Tagihan Baru', 'value' => (string) $created],
            ],
            'billing',
            $created > 0 ? 'success' : 'warning',
            'billing_generated'
        );
    }

    public function checkIntegrations(): void
    {
        $waHealth = $this->whatsApp->checkHealth();
        if (!$waHealth['success']) {
            discordNotify(
                'WhatsApp Gateway Bermasalah',
                'Scheduler mendeteksi WhatsApp Gateway tidak sehat.',
                [['name' => 'Detail', 'value' => $waHealth['message'], 'inline' => false]],
                'alert',
                'danger',
                'wa_failed'
            );
        }

        $mikroTik = $this->mikroTik->testConnection(Pengaturan::get('mikrotik_test_username'));
        if (!$mikroTik['success']) {
            discordNotify(
                'MikroTik Bermasalah',
                'Scheduler mendeteksi konfigurasi atau koneksi MikroTik tidak siap.',
                [['name' => 'Detail', 'value' => $mikroTik['message'], 'inline' => false]],
                'alert',
                'danger',
                'mikrotik_failed'
            );
        }
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
            (new PaymentHistory())->create([
                'tagihan_id' => (int) $bill['id'],
                'id_pelanggan' => (int) $bill['id_pelanggan'],
                'metode_bayar' => (string) ($bill['metode_bayar'] ?? 'manual'),
                'jumlah_bayar' => (float) $bill['harga'],
                'dibayar_pada' => date('Y-m-d H:i:s'),
                'catatan' => 'Pembayaran diproses oleh scheduler dari status menunggu_wa',
                'bukti_pembayaran' => $bill['bukti_pembayaran'] ?? null,
                'created_by_user_id' => $bill['paid_by_user_id'] ?? null,
            ]);
            discordNotify(
                'Pembayaran Lunas Otomatis',
                "Tagihan pelanggan {$bill['nama']} diproses lunas oleh scheduler.",
                [
                    ['name' => 'Pelanggan', 'value' => $bill['nama']],
                    ['name' => 'Periode', 'value' => date('F Y', strtotime($bill['periode']))],
                    ['name' => 'Nominal', 'value' => 'Rp ' . number_format((float) $bill['harga'], 0, ',', '.')],
                ],
                'billing',
                'success',
                'payment_paid'
            );
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
                discordNotify(
                    'Pelanggan Dilimit Otomatis',
                    "Pelanggan {$customer['nama']} melewati jatuh tempo dan dilimit oleh scheduler.",
                    [
                        ['name' => 'Pelanggan', 'value' => $customer['nama']],
                        ['name' => 'Jatuh Tempo', 'value' => date('d/m/Y', strtotime($customer['due_date'] ?? date('Y-m-d')))],
                        ['name' => 'Profile Limit', 'value' => (string) $customer['profile_limit_mikrotik']],
                    ],
                    'alert',
                    'warning',
                    'pelanggan_jatuh_tempo'
                );
                if (!$result['success']) {
                    discordNotify(
                        'Pengiriman WA Gagal',
                        "Notifikasi WA jatuh tempo gagal terkirim untuk {$customer['nama']}.",
                        [['name' => 'Error', 'value' => $result['error'] ?? 'Unknown error', 'inline' => false]],
                        'alert',
                        'danger',
                        'wa_failed'
                    );
                }
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
            if (!$result['success']) {
                discordNotify(
                    'Reminder WA Gagal',
                    "Reminder 7 hari gagal dikirim untuk {$customer['nama']}.",
                    [['name' => 'Error', 'value' => $result['error'] ?? 'Unknown error', 'inline' => false]],
                    'alert',
                    'danger',
                    'wa_failed'
                );
            }
        }
    }
}
