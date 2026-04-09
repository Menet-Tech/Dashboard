<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
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

    public function generate(): void
    {
        verify_csrf();
        $periode = (string) $this->input('periode_generate', date('Y-m'));
        $created = (new Tagihan())->generateForPeriod($periode);
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
            ActionLog::create((int) $row['id_pelanggan'], 'TAGIHAN_LUNAS', 'success', 'Tagihan ditandai lunas secara manual');
        }
        $this->json(['success' => true, 'message' => 'Tagihan berhasil ditandai lunas.', 'row' => $row]);
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

        $this->json([
            'success' => $result['success'],
            'message' => $result['success'] ? 'Pesan berhasil dikirim.' : ($result['error'] ?? 'Gagal kirim WA'),
            'fallback_url' => $result['fallback_url'] ?? null,
            'wa_me_url' => 'https://wa.me/' . $row['no_wa'] . '?text=' . urlencode($message),
        ]);
    }
}
