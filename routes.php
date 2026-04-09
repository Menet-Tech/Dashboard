<?php

use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\MapsController;
use App\Controllers\PaketController;
use App\Controllers\PelangganController;
use App\Controllers\PengaturanController;
use App\Controllers\TagihanController;
use App\Controllers\TemplateController;

$router->get('/', [DashboardController::class, 'index'], true);

$router->get('/login', [AuthController::class, 'showLogin']);
$router->post('/login', [AuthController::class, 'login']);
$router->post('/logout', [AuthController::class, 'logout'], true);

$router->get('/dashboard', [DashboardController::class, 'index'], true);

$router->get('/pelanggan', [PelangganController::class, 'index'], true);
$router->get('/pelanggan/create', [PelangganController::class, 'create'], true);
$router->get('/pelanggan/show', [PelangganController::class, 'show'], true);
$router->post('/pelanggan/store', [PelangganController::class, 'store'], true);
$router->get('/pelanggan/edit', [PelangganController::class, 'edit'], true);
$router->post('/pelanggan/update', [PelangganController::class, 'update'], true);
$router->post('/pelanggan/delete', [PelangganController::class, 'delete'], true);

$router->get('/tagihan', [TagihanController::class, 'index'], true);
$router->get('/tagihan/data', [TagihanController::class, 'data'], true);
$router->post('/tagihan/generate', [TagihanController::class, 'generate'], true);
$router->post('/tagihan/lunas', [TagihanController::class, 'markPaid'], true);
$router->post('/tagihan/redo', [TagihanController::class, 'redo'], true);
$router->post('/tagihan/send-wa', [TagihanController::class, 'sendWhatsapp'], true);

$router->get('/maps', [MapsController::class, 'index'], true);

$router->get('/template-wa', [TemplateController::class, 'index'], true);
$router->post('/template-wa/save', [TemplateController::class, 'save'], true);

$router->get('/paket', [PaketController::class, 'index'], true);
$router->post('/paket/save', [PaketController::class, 'save'], true);
$router->post('/paket/delete', [PaketController::class, 'delete'], true);

$router->get('/pengaturan', [PengaturanController::class, 'index'], true);
$router->post('/pengaturan/save', [PengaturanController::class, 'save'], true);
$router->post('/pengaturan/test-wa', [PengaturanController::class, 'testWhatsapp'], true);
$router->post('/pengaturan/test-discord', [PengaturanController::class, 'testDiscord'], true);
$router->post('/pengaturan/test-mikrotik', [PengaturanController::class, 'testMikrotik'], true);
