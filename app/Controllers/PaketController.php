<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\Paket;

class PaketController extends Controller
{
    public function index(): void
    {
        $model = new Paket();
        $editingId = (int) $this->input('edit', 0);

        $this->view('paket/index', [
            'title' => 'Master Paket',
            'rows' => $model->all(),
            'editing' => $editingId > 0 ? $model->find($editingId) : null,
        ]);
    }

    public function save(): void
    {
        verify_csrf();
        (new Paket())->save([
            'id' => $this->input('id') ? (int) $this->input('id') : null,
            'nama_paket' => trim((string) $this->input('nama_paket')),
            'harga' => (float) $this->input('harga'),
            'profile_mikrotik' => trim((string) $this->input('profile_mikrotik')),
            'profile_limit_mikrotik' => trim((string) $this->input('profile_limit_mikrotik')),
        ]);

        Session::flash('success', 'Paket berhasil disimpan.');
        redirect('/paket');
    }

    public function delete(): void
    {
        verify_csrf();
        $model = new Paket();
        $id = (int) $this->input('id');
        if ($model->isUsed($id)) {
            Session::flash('error', 'Paket tidak bisa dihapus karena masih dipakai pelanggan.');
            redirect('/paket');
        }

        $model->delete($id);
        Session::flash('success', 'Paket berhasil dihapus.');
        redirect('/paket');
    }
}
