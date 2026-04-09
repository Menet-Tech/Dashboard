<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\User;

class AuthController extends Controller
{
    public function showLogin(): void
    {
        if (Session::has('user')) {
            redirect('/dashboard');
        }

        require BASE_PATH . '/app/Views/auth/login.php';
    }

    public function login(): void
    {
        verify_csrf();

        $username = trim((string) $this->input('username', ''));
        $password = (string) $this->input('password', '');
        $user = (new User())->findByUsername($username);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Session::flash('error', 'Username atau password salah.');
            remember_old_inputs(['username' => $username]);
            redirect('/login');
        }

        Session::set('user', [
            'id' => $user['id'],
            'username' => $user['username'],
            'nama_lengkap' => $user['nama_lengkap'],
            'role' => $user['role'],
        ]);
        (new User())->updateLastLogin((int) $user['id']);

        redirect('/dashboard');
    }

    public function logout(): void
    {
        verify_csrf();
        Session::destroy();
        redirect('/login');
    }
}
