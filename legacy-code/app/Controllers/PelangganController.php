<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\Paket;
use App\Models\Pelanggan;
use App\Models\Tagihan;

class PelangganController extends Controller
{
    public function index(): void
    {
        $query = (string) $this->input('q', '');
        $this->view('pelanggan/index', [
            'title' => 'Pelanggan',
            'rows' => (new Pelanggan())->all($query),
            'query' => $query,
        ]);
    }

    public function create(): void
    {
        $this->view('pelanggan/form', [
            'title' => 'Tambah Pelanggan',
            'row' => null,
            'paketList' => (new Paket())->all(),
        ]);
    }

    public function edit(): void
    {
        $id = (int) $this->input('id');
        $this->view('pelanggan/form', [
            'title' => 'Edit Pelanggan',
            'row' => (new Pelanggan())->find($id),
            'paketList' => (new Paket())->all(),
        ]);
    }

    public function show(): void
    {
        $id = (int) $this->input('id');
        $pelanggan = (new Pelanggan())->findDetailed($id);

        if (!$pelanggan) {
            Session::flash('error', 'Data pelanggan tidak ditemukan.');
            redirect('/pelanggan');
        }

        $this->view('pelanggan/show', [
            'title' => 'Informasi Pelanggan',
            'row' => $pelanggan,
            'recentBills' => (new Tagihan())->forCustomer($id),
        ]);
    }

    public function store(): void
    {
        $this->persist();
    }

    public function update(): void
    {
        $this->persist(true);
    }

    private function persist(bool $isUpdate = false): void
    {
        verify_csrf();
        $id = $isUpdate ? (int) $this->input('id') : null;
        $userPppoe = trim((string) $this->input('user_pppoe'));
        $model = new Pelanggan();

        if ($model->existsUserPppoe($userPppoe, $id)) {
            Session::flash('error', 'User PPPoE sudah digunakan.');
            redirect($isUpdate ? '/pelanggan/edit?id=' . $id : '/pelanggan/create');
        }

        $model->save([
            'id' => $id,
            'id_paket' => (int) $this->input('id_paket'),
            'nama' => trim((string) $this->input('nama')),
            'user_pppoe' => $userPppoe,
            'pass_pppoe' => trim((string) $this->input('pass_pppoe')),
            'no_wa' => preg_replace('/\D+/', '', (string) $this->input('no_wa')),
            'sn_ont' => trim((string) $this->input('sn_ont')),
            'latitude' => $this->input('latitude') ?: null,
            'longitude' => $this->input('longitude') ?: null,
            'alamat' => trim((string) $this->input('alamat')),
            'tgl_jatuh_tempo' => Pelanggan::normalizeDueDay((int) $this->input('tgl_jatuh_tempo_day')),
            'status' => (string) $this->input('status', 'active'),
        ]);

        Session::flash('success', 'Data pelanggan berhasil disimpan.');
        redirect('/pelanggan');
    }

    public function delete(): void
    {
        verify_csrf();
        $this->requireAdmin();
        (new Pelanggan())->softDelete((int) $this->input('id'));
        Session::flash('success', 'Pelanggan berhasil dihapus.');
        redirect('/pelanggan');
    }

    public function updateStatus(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $status = (string) $this->input('status', 'active');
        if (!in_array($status, ['active', 'limit', 'inactive'], true)) {
            Session::flash('error', 'Status pelanggan tidak valid.');
            redirect('/pelanggan');
        }

        (new Pelanggan())->updateStatus((int) $this->input('id'), $status);
        Session::flash('success', 'Status pelanggan berhasil diperbarui.');
        redirect('/pelanggan');
    }
}
