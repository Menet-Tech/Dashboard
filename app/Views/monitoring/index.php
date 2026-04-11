<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Monitoring</div>
            <h3>Status Integrasi dan Error Terkini</h3>
            <p class="section-subtitle">Halaman ini membaca status cache terakhir agar tetap responsif. Pakai refresh manual untuk pengecekan live.</p>
        </div>
        <form method="post" action="<?= base_url('/monitoring/refresh') ?>">
            <?= csrf_field() ?>
            <button class="btn btn-primary">Refresh Status Live</button>
        </form>
    </div>
    <div class="row g-4">
        <?php foreach ($statuses as $name => $status): ?>
            <div class="col-lg-3">
                <div class="stat-card">
                    <span><?= ucwords(str_replace('_', ' ', $name)) ?></span>
                    <strong><?= $status['success'] ? 'OK' : 'Issue' ?></strong>
                    <small><?= htmlspecialchars($status['message']) ?></small>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Health Check Terkini</h3></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Service</th><th>Status</th><th>Message</th><th>Checked</th></tr></thead><tbody><?php foreach ($healthChecks as $row): ?><tr><td><?= htmlspecialchars($row['service_name']) ?></td><td><?= htmlspecialchars($row['status']) ?></td><td><?= htmlspecialchars((string) $row['message']) ?></td><td><?= htmlspecialchars($row['checked_at']) ?></td></tr><?php endforeach; ?><?php if ($healthChecks === []): ?><tr><td colspan="4" class="text-center text-muted py-4">Belum ada health check tersimpan.</td></tr><?php endif; ?></tbody></table></div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Log Error Terpusat</h3></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Aksi</th><th>Pesan</th><th>Waktu</th></tr></thead><tbody><?php foreach ($recentErrors as $row): ?><tr><td><?= htmlspecialchars($row['tipe_aksi']) ?></td><td><?= htmlspecialchars((string) $row['pesan']) ?></td><td><?= htmlspecialchars($row['created_at']) ?></td></tr><?php endforeach; ?><?php if ($recentErrors === []): ?><tr><td colspan="3" class="text-center text-muted py-4">Belum ada error terbaru.</td></tr><?php endif; ?></tbody></table></div>
        </div>
    </div>
</div>
