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
        <div class="surface-card">
            <div class="section-title"><h3>Log Terbaru</h3></div>
            <div class="log-list">
                <?php foreach ($latestLogs as $log): ?>
                    <div class="log-item">
                        <strong><?= htmlspecialchars($log['tipe_aksi']) ?></strong>
                        <span class="badge text-bg-<?= $log['status'] === 'success' ? 'success' : 'danger' ?>"><?= htmlspecialchars($log['status']) ?></span>
                        <p><?= htmlspecialchars((string) ($log['pesan'] ?? '-')) ?></p>
                        <small><?= htmlspecialchars($log['created_at']) ?></small>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
</div>

<script>window.dashboardChart = <?= json_encode($chartData, JSON_UNESCAPED_UNICODE) ?>;</script>
