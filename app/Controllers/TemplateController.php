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
        $this->view('template/index', [
            'title' => 'Template WhatsApp',
            'rows' => (new TemplateWA())->all(),
        ]);
    }

    public function save(): void
    {
        verify_csrf();
        $ids = $_POST['id'] ?? [];
        $names = $_POST['nama'] ?? [];
        $messages = $_POST['isi_pesan'] ?? [];
        $active = $_POST['is_active'] ?? [];
        $rows = [];

        foreach ($ids as $index => $id) {
            $rows[] = [
                'id' => (int) $id,
                'nama' => trim((string) ($names[$index] ?? '')),
                'isi_pesan' => (string) ($messages[$index] ?? ''),
                'is_active' => isset($active[$index]) ? 1 : 0,
            ];
        }

        (new TemplateWA())->saveBatch($rows);
        Session::flash('success', 'Template WhatsApp berhasil diperbarui.');
        redirect('/template-wa');
    }
}
