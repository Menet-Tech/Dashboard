<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\PaymentHistory;
use App\Models\Pelanggan;
use App\Models\Pengaturan;
use App\Models\Tagihan;
use App\Models\TemplateWA;
use App\Models\WhatsAppAPI;

class TagihanController extends Controller
{
    public function index(): void
    {
        $filters = [
            'status' => (string) $this->input('status', ''),
            'periode' => (string) $this->input('periode', ''),
        ];

        $this->view('tagihan/index', [
            'title' => 'Tagihan',
            'rows' => (new Tagihan())->all($filters),
            'filters' => $filters,
            'defaultPeriode' => $filters['periode'] !== '' ? $filters['periode'] : date('Y-m'),
        ]);
    }

    public function data(): void
    {
        $this->json(['data' => (new Tagihan())->all([
            'status' => (string) $this->input('status', ''),
            'periode' => (string) $this->input('periode', ''),
        ])]);
    }

    public function show(): void
    {
        $id = (int) $this->input('id');
        $bill = (new Tagihan())->find($id);

        if (!$bill) {
            Session::flash('error', 'Tagihan tidak ditemukan.');
            redirect('/tagihan');
        }

        $this->view('tagihan/show', [
            'title' => 'Detail Tagihan',
            'row' => $bill,
            'paymentHistory' => (new PaymentHistory())->byBill($id),
        ]);
    }

    public function invoice(): void
    {
        $id = (int) $this->input('id');
        $bill = (new Tagihan())->find($id);

        if (!$bill) {
            Session::flash('error', 'Tagihan tidak ditemukan.');
            redirect('/tagihan');
        }

        if (($bill['status'] ?? 'belum_bayar') !== 'lunas') {
            Session::flash('error', 'Invoice hanya tersedia untuk tagihan yang sudah lunas.');
            redirect('/tagihan/show?id=' . $id);
        }

        $this->view('tagihan/invoice', [
            'title' => 'Invoice',
            'row' => $bill,
            'paymentHistory' => (new PaymentHistory())->byBill($id),
            'namaIsp' => Pengaturan::get('nama_isp', 'Menet-Tech'),
            'noRekening' => Pengaturan::get('no_rekening', '-'),
        ]);
    }

    public function generate(): void
    {
        verify_csrf();
        $this->requireAdmin();
        $periode = (string) $this->input('periode_generate', date('Y-m'));
        $created = (new Tagihan())->generateForPeriod($periode);
        discordNotify(
            'Generate Tagihan Manual',
            'Petugas menjalankan generate tagihan manual dari dashboard.',
            [
                ['name' => 'Periode', 'value' => $periode],
                ['name' => 'Tagihan Baru', 'value' => (string) $created],
                ['name' => 'Operator', 'value' => (string) ((Session::get('user')['nama_lengkap'] ?? 'Petugas'))],
            ],
            'billing',
            $created > 0 ? 'success' : 'warning',
            'billing_generated'
        );
        Session::flash('success', $created > 0
            ? "Berhasil generate {$created} tagihan untuk periode {$periode}."
            : "Tidak ada tagihan baru untuk periode {$periode}. Semua pelanggan yang memenuhi sudah punya tagihan.");
        redirect('/tagihan?periode=' . urlencode($periode));
    }

    public function markPaid(): void
    {
        verify_csrf();
        $id = (int) $this->input('id');
        $model = new Tagihan();
        $model->markPaid($id);
        $row = $model->find($id);
        if ($row) {
            $userId = $this->userId();
            $model->registerPayment($id, [
                'tgl_bayar' => date('Y-m-d H:i:s'),
                'metode_bayar' => 'manual',
                'catatan_pembayaran' => 'Pelunasan cepat dari daftar tagihan',
                'bukti_pembayaran' => null,
                'paid_by_user_id' => $userId,
                'updated_by_user_id' => $userId,
            ]);
            (new PaymentHistory())->create([
                'tagihan_id' => $id,
                'id_pelanggan' => (int) $row['id_pelanggan'],
                'metode_bayar' => 'manual',
                'jumlah_bayar' => (float) $row['harga'],
                'dibayar_pada' => date('Y-m-d H:i:s'),
                'catatan' => 'Pelunasan cepat dari daftar tagihan',
                'bukti_pembayaran' => null,
                'created_by_user_id' => $userId,
            ]);
            ActionLog::create((int) $row['id_pelanggan'], 'TAGIHAN_LUNAS', 'success', 'Tagihan ditandai lunas secara manual', $userId);
            discordNotify(
                'Pembayaran Ditandai Lunas',
                "Petugas menandai pembayaran {$row['nama']} sebagai lunas.",
                [
                    ['name' => 'Pelanggan', 'value' => $row['nama']],
                    ['name' => 'Periode', 'value' => date('F Y', strtotime($row['periode']))],
                    ['name' => 'Nominal', 'value' => 'Rp ' . number_format((float) $row['harga'], 0, ',', '.')],
                ],
                'billing',
                'success',
                'payment_paid'
            );
            $this->restorePelangganStatusIfPaid((int) $row['id_pelanggan'], $model);
            $waResult = $this->sendAutomaticWhatsapp($model->find($id), 'lunas');
            if (!$waResult['success']) {
                $row['wa_error'] = $waResult['message'];
            }
        }
        $message = 'Tagihan berhasil ditandai lunas.';
        if (!empty($row['wa_error'])) {
            $message .= ' WA otomatis gagal: ' . $row['wa_error'];
        }
        $this->json(['success' => true, 'message' => $message, 'row' => $row]);
    }

    public function pay(): void
    {
        verify_csrf();
        $id = (int) $this->input('id');
        $model = new Tagihan();
        $bill = $model->find($id);

        if (!$bill) {
            Session::flash('error', 'Tagihan tidak ditemukan.');
            redirect('/tagihan');
        }

        $proofPath = null;
        if (!empty($_FILES['bukti_pembayaran']['tmp_name']) && is_uploaded_file($_FILES['bukti_pembayaran']['tmp_name'])) {
            $extension = pathinfo($_FILES['bukti_pembayaran']['name'], PATHINFO_EXTENSION) ?: 'bin';
            $filename = 'payment-proof-' . $id . '-' . time() . '.' . strtolower($extension);
            $target = BASE_PATH . '/public/uploads/payment-proofs/' . $filename;
            if (!move_uploaded_file($_FILES['bukti_pembayaran']['tmp_name'], $target)) {
                Session::flash('error', 'Upload bukti pembayaran gagal.');
                redirect('/tagihan/show?id=' . $id);
            }
            $proofPath = 'uploads/payment-proofs/' . $filename;
        }

        $paidAt = $this->input('dibayar_pada', date('Y-m-d\TH:i'));
        $userId = $this->userId();

        $model->registerPayment($id, [
            'tgl_bayar' => date('Y-m-d H:i:s', strtotime((string) $paidAt)),
            'metode_bayar' => (string) $this->input('metode_bayar', 'manual'),
            'catatan_pembayaran' => trim((string) $this->input('catatan_pembayaran', '')),
            'bukti_pembayaran' => $proofPath,
            'paid_by_user_id' => $userId,
            'updated_by_user_id' => $userId,
        ]);

        (new PaymentHistory())->create([
            'tagihan_id' => $id,
            'id_pelanggan' => (int) $bill['id_pelanggan'],
            'metode_bayar' => (string) $this->input('metode_bayar', 'manual'),
            'jumlah_bayar' => (float) $bill['harga'],
            'dibayar_pada' => date('Y-m-d H:i:s', strtotime((string) $paidAt)),
            'catatan' => trim((string) $this->input('catatan_pembayaran', '')),
            'bukti_pembayaran' => $proofPath,
            'created_by_user_id' => $userId,
        ]);

        ActionLog::create((int) $bill['id_pelanggan'], 'PAYMENT_RECORDED', 'success', 'Pembayaran dicatat lengkap', $userId);
        discordNotify(
            'Pembayaran Dicatat',
            "Pembayaran {$bill['nama']} dicatat lengkap melalui form detail tagihan.",
            [
                ['name' => 'Metode', 'value' => (string) $this->input('metode_bayar', 'manual')],
                ['name' => 'Nominal', 'value' => 'Rp ' . number_format((float) $bill['harga'], 0, ',', '.')],
                ['name' => 'Operator', 'value' => (string) ($this->user()['nama_lengkap'] ?? 'Petugas')],
            ],
            'billing',
            'success',
            'payment_paid'
        );

        $this->restorePelangganStatusIfPaid((int) $bill['id_pelanggan'], $model);
        $waResult = $this->sendAutomaticWhatsapp($model->find($id), 'lunas');
        Session::flash($waResult['success'] ? 'success' : 'error', $waResult['success']
            ? 'Pembayaran berhasil dicatat dan WhatsApp lunas dikirim.'
            : 'Pembayaran berhasil dicatat, tetapi WhatsApp lunas gagal dikirim: ' . $waResult['message']);
        redirect('/tagihan/show?id=' . $id);
    }

    /**
     * If the customer has no remaining unpaid bills after a payment,
     * restore their pelanggan status from 'limit' to 'active'.
     */
    private function restorePelangganStatusIfPaid(int $pelangganId, Tagihan $model): void
    {
        if ($model->countUnpaidForCustomer($pelangganId) === 0) {
            (new Pelanggan())->updateStatus($pelangganId, 'active');
        }
    }

    public function redo(): void
    {
        verify_csrf();
        (new Tagihan())->redo((int) $this->input('id'));
        $this->json(['success' => true, 'message' => 'Status tagihan dikembalikan ke belum bayar.']);
    }

    public function sendWhatsapp(): void
    {
        verify_csrf();
        $row = (new Tagihan())->find((int) $this->input('id'));
        if (!$row) {
            $this->json(['success' => false, 'message' => 'Tagihan tidak ditemukan.'], 404);
            return;
        }

        $trigger = (string) $this->input('trigger', 'jatuh_tempo');
        $template = TemplateWA::getByTrigger($trigger);
        $message = TemplateWA::parse($template['isi_pesan'] ?? 'Halo {nama}', $row);
        $result = (new WhatsAppAPI())->sendText((string) $row['no_wa'], $message);
        ActionLog::create((int) $row['id_pelanggan'], 'WA_SENT', $result['success'] ? 'success' : 'failed', $result['error'] ?? ($result['message_id'] ?? 'Manual send'));
        if (!$result['success']) {
            discordNotify(
                'Pengiriman WA Manual Gagal',
                "Pengiriman WA manual dari halaman tagihan gagal untuk {$row['nama']}.",
                [['name' => 'Error', 'value' => $result['error'] ?? 'Unknown error', 'inline' => false]],
                'alert',
                'danger',
                'wa_failed'
            );
        }

        $this->json([
            'success' => $result['success'],
            'message' => $result['success'] ? 'Pesan berhasil dikirim.' : ($result['error'] ?? 'Gagal kirim WA'),
            'fallback_url' => $result['fallback_url'] ?? null,
            'wa_me_url' => 'https://wa.me/' . $row['no_wa'] . '?text=' . urlencode($message),
        ]);
    }

    private function sendAutomaticWhatsapp(?array $bill, string $trigger): array
    {
        if (!$bill) {
            return ['success' => false, 'message' => 'Tagihan tidak ditemukan'];
        }

        $template = TemplateWA::getByTrigger($trigger);
        if (!$template) {
            return ['success' => false, 'message' => "Template {$trigger} belum aktif"];
        }

        $message = TemplateWA::parse($template['isi_pesan'] ?? 'Halo {nama}', $bill);
        $result = (new WhatsAppAPI())->sendText((string) $bill['no_wa'], $message);
        ActionLog::create((int) $bill['id_pelanggan'], 'WA_SENT', $result['success'] ? 'success' : 'failed', $result['error'] ?? ($result['message_id'] ?? "Auto {$trigger}"));

        if (!$result['success']) {
            discordNotify(
                'Pengiriman WA Otomatis Gagal',
                "Pengiriman WA otomatis {$trigger} gagal untuk {$bill['nama']}.",
                [['name' => 'Error', 'value' => $result['error'] ?? 'Unknown error', 'inline' => false]],
                'alert',
                'danger',
                'wa_failed'
            );
        }

        return [
            'success' => $result['success'],
            'message' => $result['success'] ? 'Pesan berhasil dikirim.' : ($result['error'] ?? 'Gagal kirim WA'),
        ];
    }
}
