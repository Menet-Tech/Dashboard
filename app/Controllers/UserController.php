<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\User;

class UserController extends Controller
{
    public function index(): void
    {
        $this->requireAdmin();
        $this->view('users/index', [
            'title' => 'Manajemen User',
            'rows' => (new User())->all(),
        ]);
    }

    public function save(): void
    {
        verify_csrf();
        $this->requireAdmin();

        $username = trim((string) $this->input('username'));
        $password = (string) $this->input('password');
        $fullName = trim((string) $this->input('nama_lengkap'));
        $role = (string) $this->input('role', 'petugas');

        if ($username === '' || $password === '' || $fullName === '') {
            Session::flash('error', 'Username, nama lengkap, dan password wajib diisi.');
            redirect('/users');
        }

        (new User())->create([
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'nama_lengkap' => $fullName,
            'role' => in_array($role, ['admin', 'petugas'], true) ? $role : 'petugas',
            'is_active' => 1,
        ]);

        ActionLog::create(null, 'USER_CREATED', 'success', "User {$username} dibuat", $this->userId());
        Session::flash('success', 'User baru berhasil dibuat.');
        redirect('/users');
    }
}
