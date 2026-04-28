<section class="hero-banner">
    <div class="hero-copy">
        <div class="brand-kicker">Operasional Hari Ini</div>
        <h2><?= htmlspecialchars($namaIsp) ?></h2>
        <p>Ringkasan pelanggan aktif, status limit, tunggakan, dan performa pendapatan bulanan.</p>
    </div>
    <div class="hero-pulse">
        <span class="hero-pulse-label">Pendapatan Lunas</span>
        <strong>Rp <?= number_format((float) ($summary['pendapatan_lunas'] ?? 0), 0, ',', '.') ?></strong>
        <small>Akumulasi seluruh tagihan berstatus lunas</small>
    </div>
</section>

<div class="row g-4 mb-4">
    <div class="col-md-3"><div class="stat-card"><span>Total Pelanggan</span><strong><?= (int) ($summary['total_non_deleted'] ?? 0) ?></strong><small>Semua pelanggan aktif di sistem</small></div></div>
    <div class="col-md-3"><div class="stat-card"><span>Pelanggan Aktif</span><strong><?= (int) ($summary['total_active'] ?? 0) ?></strong><small>Koneksi masih berjalan normal</small></div></div>
    <div class="col-md-3"><div class="stat-card"><span>Status Limit</span><strong><?= (int) ($summary['total_limit'] ?? 0) ?></strong><small>Perlu follow up penagihan</small></div></div>
    <div class="col-md-3"><div class="stat-card"><span>Total Tunggakan</span><strong><?= (int) ($summary['total_tunggakan'] ?? 0) ?></strong><small>Tagihan belum dibayar</small></div></div>
</div>

<div class="row g-4">
    <div class="col-lg-8">
        <div class="surface-card">
            <div class="section-title">
                <div>
                    <div class="brand-kicker">Chart</div>
                    <h3>Pendapatan Bulanan</h3>
                    <p class="section-subtitle">Perbandingan pendapatan terkumpul dan potensi tagihan per bulan.</p>
                </div>
            </div>
            <div class="chart-shell">
                <canvas id="incomeChart"></canvas>
            </div>
        </div>
    </div>
    <div class="col-lg-4">
        <div class="surface-card h-100">
            <div class="section-title"><h3>Log Terbaru</h3><small class="text-muted">20 aktivitas</small></div>
            <div class="log-list">
                <?php foreach ($latestLogs as $log): ?>
                    <?php
                    // Map action types to readable labels & icon colours
                    $aksiLabels = [
                        'TAGIHAN_LUNAS'    => ['label' => 'Pembayaran Lunas',    'color' => 'success'],
                        'PAYMENT_RECORDED' => ['label' => 'Pembayaran Dicatat',  'color' => 'success'],
                        'WA_SENT'          => ['label' => 'WA Terkirim',         'color' => 'info'],
                        'PELANGGAN_LIMIT'  => ['label' => 'Pelanggan Dilimit',   'color' => 'warning'],
                        'LOGIN'            => ['label' => 'Login',               'color' => 'secondary'],
                        'LOGOUT'           => ['label' => 'Logout',              'color' => 'secondary'],
                        'GENERATE_TAGIHAN' => ['label' => 'Generate Tagihan',    'color' => 'primary'],
                    ];
                    $aksiMeta = $aksiLabels[$log['tipe_aksi']] ?? ['label' => $log['tipe_aksi'], 'color' => 'secondary'];
                    $statusBadge = $log['status'] === 'success' ? 'success' : ($log['status'] === 'failed' ? 'danger' : 'warning');

                    // Relative time
                    $ts = strtotime($log['created_at']);
                    $diff = time() - $ts;
                    if ($diff < 60) $relTime = 'Baru saja';
                    elseif ($diff < 3600) $relTime = (int)($diff/60) . ' mnt lalu';
                    elseif ($diff < 86400) $relTime = (int)($diff/3600) . ' jam lalu';
                    else $relTime = date('d/m/Y H:i', $ts);
                    ?>
                    <div class="log-item">
                        <div class="log-item-header">
                            <span class="badge text-bg-<?= $aksiMeta['color'] ?> log-action-badge"><?= htmlspecialchars($aksiMeta['label']) ?></span>
                            <span class="badge text-bg-<?= $statusBadge ?>"><?= htmlspecialchars($log['status']) ?></span>
                        </div>
                        <?php if (!empty($log['nama_pelanggan'])): ?>
                            <div class="log-customer"><i class="bi bi-person-fill"></i> <?= htmlspecialchars($log['nama_pelanggan']) ?></div>
                        <?php endif; ?>
                        <?php if (!empty($log['pesan'])): ?>
                            <p class="log-detail"><?= htmlspecialchars((string) $log['pesan']) ?></p>
                        <?php endif; ?>
                        <small class="log-time text-muted"><?= $relTime ?></small>
                    </div>
                <?php endforeach; ?>
                <?php if (empty($latestLogs)): ?>
                    <div class="text-center text-muted py-4 small">Belum ada aktivitas.</div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<div class="row g-4 mt-1">
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Status Layanan</h3></div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Layanan</th><th>Status</th><th>Detail</th></tr></thead>
                    <tbody>
                    <tr><td>WA Gateway</td><td><?= $serviceStatuses['wa']['success'] ? 'OK' : 'Issue' ?></td><td><?= htmlspecialchars($serviceStatuses['wa']['message']) ?></td></tr>
                    <tr><td>MikroTik</td><td><?= $serviceStatuses['mikrotik']['success'] ? 'OK' : 'Issue' ?></td><td><?= htmlspecialchars($serviceStatuses['mikrotik']['message']) ?></td></tr>
                    <tr><td>Discord Bot</td><td><?= $serviceStatuses['discordBot']['success'] ? 'OK' : 'Issue' ?></td><td><?= htmlspecialchars($serviceStatuses['discordBot']['message']) ?></td></tr>
                    <tr><td>Cron</td><td><?= $serviceStatuses['cron']['success'] ? 'OK' : 'Issue' ?></td><td><?= htmlspecialchars($serviceStatuses['cron']['message']) ?></td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Tagihan Belum Bayar Terbaru</h3></div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Pelanggan</th><th>Periode</th><th>Nominal</th></tr></thead>
                    <tbody>
                    <?php foreach ($latestUnpaid as $bill): ?>
                        <tr>
                            <td><?= htmlspecialchars($bill['nama']) ?></td>
                            <td><?= date('F Y', strtotime($bill['periode'])) ?></td>
                            <td>Rp <?= number_format((float) $bill['harga'], 0, ',', '.') ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if ($latestUnpaid === []): ?><tr><td colspan="3" class="text-center text-muted py-4">Tidak ada tagihan belum bayar.</td></tr><?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<script>window.dashboardChart = <?= json_encode($chartData, JSON_UNESCAPED_UNICODE) ?>;</script>
