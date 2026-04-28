<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\TemplateWA;

class TemplateController extends Controller
{
    public function index(): void
    {
        $model = new TemplateWA();
        $editingId = (int) $this->input('edit', 0);

        $this->view('template/index', [
            'title' => 'Template WhatsApp',
            'rows' => $model->all(),
            'editing' => $editingId > 0 ? array_values(array_filter($model->all(), static fn (array $row): bool => (int) $row['id'] === $editingId))[0] ?? null : null,
        ]);
    }

    public function save(): void
    {
        verify_csrf();
        $model = new TemplateWA();
        $id = $this->input('id') ? (int) $this->input('id') : null;
        $trigger = trim((string) $this->input('trigger_event'));

        if ($trigger === '') {
            Session::flash('error', 'Trigger template wajib diisi.');
            redirect('/template-wa');
        }

        if ($model->existsTrigger($trigger, $id)) {
            Session::flash('error', 'Trigger template sudah digunakan.');
            redirect('/template-wa' . ($id ? '?edit=' . $id : ''));
        }

        $model->save([
            'id' => $id,
            'nama' => trim((string) $this->input('nama')),
            'trigger_event' => $trigger,
            'isi_pesan' => (string) $this->input('isi_pesan', ''),
            'is_active' => $this->input('is_active') ? 1 : 0,
        ]);

        Session::flash('success', 'Template WhatsApp berhasil disimpan.');
        redirect('/template-wa');
    }

    public function delete(): void
    {
        verify_csrf();
        $this->requireAdmin();
        (new TemplateWA())->delete((int) $this->input('id'));
        Session::flash('success', 'Template WhatsApp berhasil dihapus.');
        redirect('/template-wa');
    }
}
