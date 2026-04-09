<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Backup</div>
            <h3>Backup Database</h3>
            <p class="section-subtitle">Backup akan disimpan ke folder `storage/backups` dan dicatat ke backup log.</p>
        </div>
        <form method="post" action="<?= base_url('/backup/create') ?>">
            <?= csrf_field() ?>
            <button class="btn btn-primary">Buat Backup Sekarang</button>
        </form>
    </div>
</div>

<div class="surface-card">
    <div class="section-title"><h3>Riwayat Backup</h3></div>
    <div class="table-responsive">
        <table class="table table-hover">
            <thead><tr><th>File</th><th>Status</th><th>Size</th><th>Operator</th><th>Waktu</th></tr></thead>
            <tbody>
            <?php foreach ($rows as $row): ?>
                <tr>
                    <td><?= htmlspecialchars($row['filename']) ?></td>
                    <td><?= htmlspecialchars($row['status']) ?></td>
                    <td><?= $row['size_bytes'] ? number_format((int) $row['size_bytes'] / 1024, 2, ',', '.') . ' KB' : '-' ?></td>
                    <td><?= htmlspecialchars((string) ($row['nama_lengkap'] ?: '-')) ?></td>
                    <td><?= htmlspecialchars($row['created_at']) ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if ($rows === []): ?><tr><td colspan="5" class="text-center text-muted py-4">Belum ada backup.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
