<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Informasi Lengkap</div>
            <h3><?= htmlspecialchars($row['nama']) ?></h3>
            <p class="section-subtitle">Detail pelanggan, paket aktif, kontak, lokasi, dan riwayat tagihan terbaru.</p>
        </div>
        <div class="d-flex gap-2">
            <a href="<?= base_url('/pelanggan/edit?id=' . $row['id']) ?>" class="btn btn-primary">Edit Data</a>
            <a href="<?= base_url('/pelanggan') ?>" class="btn btn-outline-secondary">Kembali</a>
        </div>
    </div>
    <div class="row g-4">
        <div class="col-lg-4"><div class="stat-card"><span>Paket</span><strong><?= htmlspecialchars($row['nama_paket']) ?></strong><small>Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?> / bulan</small></div></div>
        <div class="col-lg-4"><div class="stat-card"><span>Jatuh Tempo Bulanan</span><strong>Tanggal <?= (int) $row['due_day'] ?></strong><small>Periode berjalan: <?= date('d/m/Y', strtotime($row['due_date'])) ?></small></div></div>
        <div class="col-lg-4"><div class="stat-card"><span>Status Layanan</span><strong><?= htmlspecialchars(ucfirst($row['status'])) ?></strong><small>PPPoE: <?= htmlspecialchars($row['user_pppoe']) ?></small></div></div>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-5">
        <div class="surface-card h-100">
            <div class="section-title"><h3>Profil Pelanggan</h3></div>
            <div class="detail-grid">
                <div><span>Nomor WA</span><strong><?= htmlspecialchars(mask_value($row['no_wa'] ?? '', 4, 3)) ?></strong></div>
                <div><span>SN ONT</span><strong><?= htmlspecialchars(mask_value((string) ($row['sn_ont'] ?: ''), 3, 3)) ?></strong></div>
                <div><span>Profile MikroTik</span><strong><?= htmlspecialchars($row['profile_mikrotik']) ?></strong></div>
                <div><span>Profile Limit</span><strong><?= htmlspecialchars($row['profile_limit_mikrotik']) ?></strong></div>
                <div><span>Latitude</span><strong><?= htmlspecialchars((string) ($row['latitude'] ?: '-')) ?></strong></div>
                <div><span>Longitude</span><strong><?= htmlspecialchars((string) ($row['longitude'] ?: '-')) ?></strong></div>
                <div class="detail-wide"><span>Alamat</span><strong><?= nl2br(htmlspecialchars((string) ($row['alamat'] ?: '-'))) ?></strong></div>
            </div>
        </div>
    </div>
    <div class="col-lg-7">
        <div class="surface-card h-100">
            <div class="section-title"><h3>Riwayat Tagihan Terbaru</h3></div>
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead><tr><th>Periode</th><th>Jatuh Tempo</th><th>Nominal</th><th>Status</th><th>Dibayar</th></tr></thead>
                    <tbody>
                    <?php foreach ($recentBills as $bill): ?>
                        <tr>
                            <td><?= date('F Y', strtotime($bill['periode'])) ?></td>
                            <td><?= date('d/m/Y', strtotime($bill['tgl_jatuh_tempo'])) ?></td>
                            <td>Rp <?= number_format((float) $bill['harga'], 0, ',', '.') ?></td>
                            <td><span class="badge text-bg-<?= $bill['status'] === 'lunas' ? 'success' : ($bill['status'] === 'menunggu_wa' ? 'warning' : 'secondary') ?>"><?= htmlspecialchars($bill['status']) ?></span></td>
                            <td><?= htmlspecialchars((string) ($bill['tgl_bayar'] ?: '-')) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if ($recentBills === []): ?>
                        <tr><td colspan="5" class="text-center text-muted py-4">Belum ada riwayat tagihan.</td></tr>
                    <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
