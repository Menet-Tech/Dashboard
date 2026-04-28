<?php use App\Core\Session; ?>
<div class="sidebar-panel">
    <div class="brand-block">
        <div class="brand-kicker">Billing ISP</div>
        <h1><?= htmlspecialchars(\App\Models\Pengaturan::get('nama_isp', 'Menet-Tech')) ?></h1>
        <p>Operasional pelanggan, tagihan, dan notifikasi dalam satu panel.</p>
        <div id="sidebar-clock" class="sidebar-clock mt-3">
            <span class="d-block clock-date"><?= date('d F Y') ?></span>
            <span class="clock-time"><?= date('H:i') ?></span>
        </div>
    </div>
    <nav class="nav flex-column sidebar-nav">
        <?php $user = Session::get('user', []); $isAdmin = ($user['role'] ?? 'petugas') === 'admin'; ?>
        <a class="nav-link" href="<?= base_url('/dashboard') ?>">Dashboard</a>
        <a class="nav-link" href="<?= base_url('/pelanggan') ?>">Pelanggan</a>
        <a class="nav-link" href="<?= base_url('/tagihan') ?>">Tagihan</a>
        <a class="nav-link" href="<?= base_url('/laporan') ?>">Laporan</a>
        <a class="nav-link" href="<?= base_url('/template-wa') ?>">Template WA</a>
        <a class="nav-link" href="<?= base_url('/paket') ?>">Master Paket</a>
        <?php if ($isAdmin): ?>
            <a class="nav-link" href="<?= base_url('/users') ?>">Manajemen User</a>
            <a class="nav-link" href="<?= base_url('/monitoring') ?>">Monitoring</a>
            <a class="nav-link" href="<?= base_url('/backup') ?>">Backup</a>
            <a class="nav-link" href="<?= base_url('/pengaturan') ?>">Pengaturan</a>
        <?php endif; ?>
    </nav>
    <div class="sidebar-user">
        <div>
            <strong><?= htmlspecialchars((string) ($user['nama_lengkap'] ?? 'Petugas')) ?></strong>
            <small class="d-block text-white-50"><?= htmlspecialchars((string) ($user['role'] ?? 'petugas')) ?></small>
        </div>
        <form method="post" action="<?= base_url('/logout') ?>">
            <?= csrf_field() ?>
            <button class="btn btn-outline-light btn-sm">Logout</button>
        </form>
    </div>
</div>
<main class="content-panel">
