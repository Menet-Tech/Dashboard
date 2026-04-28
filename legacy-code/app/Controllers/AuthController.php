<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\Session;
use App\Models\ActionLog;
use App\Models\LoginAttempt;
use App\Models\Pengaturan;
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
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $maxAttempts = (int) Pengaturan::get('login_rate_limit_max_attempts', '5');
        $windowMinutes = (int) Pengaturan::get('login_rate_limit_window_minutes', '15');
        $attemptModel = new LoginAttempt();

        if ($attemptModel->countRecent($username, $ipAddress, $windowMinutes) >= $maxAttempts) {
            Session::flash('error', "Terlalu banyak percobaan login. Coba lagi dalam {$windowMinutes} menit.");
            redirect('/login');
        }

        $user = (new User())->findByUsername($username);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            $attemptModel->create($username, $ipAddress);
            ActionLog::create(null, 'LOGIN_FAILED', 'failed', "Login gagal untuk username {$username}");
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
        session_regenerate_id(true);
        (new User())->updateLastLogin((int) $user['id']);
        $attemptModel->clearRecent($username, $ipAddress);
        ActionLog::create(null, 'LOGIN_SUCCESS', 'success', "Login berhasil untuk username {$username}", (int) $user['id']);

        redirect('/dashboard');
    }

    public function logout(): void
    {
        verify_csrf();
        $user = Session::get('user', []);
        ActionLog::create(null, 'LOGOUT', 'success', 'User logout', isset($user['id']) ? (int) $user['id'] : null);
        Session::destroy();
        redirect('/login');
    }
}
