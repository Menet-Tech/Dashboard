<?php

declare(strict_types=1);

use App\Core\Session;

function base_url(string $path = ''): string
{
    $base = rtrim($_ENV['APP_URL'] ?? '', '/');
    if ($base === '' || preg_match('#^https?://(0\.0\.0\.0|127\.0\.0\.1|localhost)(:\\d+)?$#', $base)) {
        $base = '';
    }

    $path = ltrim($path, '/');
    return $path === '' ? $base : ($base === '' ? "/{$path}" : "{$base}/{$path}");
}

function redirect(string $path): never
{
    header('Location: ' . base_url($path));
    exit;
}

function csrf_token(): string
{
    if (!Session::has('_csrf')) {
        Session::set('_csrf', bin2hex(random_bytes(32)));
    }

    return Session::get('_csrf');
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
}

function verify_csrf(): void
{
    $token = $_POST['_token'] ?? '';
    if (!$token || !hash_equals((string) Session::get('_csrf', ''), $token)) {
        http_response_code(419);
        exit('CSRF token mismatch');
    }
}

function old(string $key, mixed $default = ''): mixed
{
    return Session::getFlash('old_' . $key, $default);
}

function remember_old_inputs(array $inputs): void
{
    foreach ($inputs as $key => $value) {
        Session::flash('old_' . $key, $value);
    }
}

function mask_value(?string $value, int $visibleStart = 2, int $visibleEnd = 2): string
{
    if ($value === null || $value === '') {
        return '-';
    }

    $length = strlen($value);
    if ($length <= ($visibleStart + $visibleEnd)) {
        return str_repeat('*', $length);
    }

    return substr($value, 0, $visibleStart) . str_repeat('*', max(4, $length - ($visibleStart + $visibleEnd))) . substr($value, -$visibleEnd);
}
