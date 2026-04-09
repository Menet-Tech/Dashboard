<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Detail Tagihan</div>
            <h3><?= htmlspecialchars($row['nama']) ?> - <?= date('F Y', strtotime($row['periode'])) ?></h3>
            <p class="section-subtitle">Kelola pembayaran, bukti bayar, histori, dan tindak lanjut notifikasi dari satu halaman.</p>
        </div>
        <div class="d-flex gap-2">
            <a href="<?= base_url('/pelanggan/show?id=' . $row['id_pelanggan']) ?>" class="btn btn-outline-secondary">Info Pelanggan</a>
            <a href="<?= base_url('/tagihan') ?>" class="btn btn-outline-secondary">Kembali</a>
        </div>
    </div>
    <div class="row g-4">
        <div class="col-lg-3"><div class="stat-card"><span>Status</span><strong><?= htmlspecialchars(ucfirst(str_replace('_', ' ', $row['status']))) ?></strong><small>Dibuat <?= htmlspecialchars($row['tgl_tagihan']) ?></small></div></div>
        <div class="col-lg-3"><div class="stat-card"><span>Nominal</span><strong>Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></strong><small>Jatuh tempo <?= date('d/m/Y', strtotime($row['tgl_jatuh_tempo'])) ?></small></div></div>
        <div class="col-lg-3"><div class="stat-card"><span>Metode Bayar</span><strong><?= htmlspecialchars((string) ($row['metode_bayar'] ?: '-')) ?></strong><small><?= htmlspecialchars((string) ($row['tgl_bayar'] ?: 'Belum dibayar')) ?></small></div></div>
        <div class="col-lg-3"><div class="stat-card"><span>PPPoE</span><strong><?= htmlspecialchars($row['user_pppoe']) ?></strong><small><?= htmlspecialchars($row['nama_paket']) ?></small></div></div>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-5">
        <div class="surface-card h-100">
            <div class="section-title">
                <div>
                    <div class="brand-kicker">Pembayaran</div>
                    <h3>Catat Pembayaran</h3>
                </div>
            </div>
            <form method="post" action="<?= base_url('/tagihan/pay') ?>" enctype="multipart/form-data" class="row g-3">
                <?= csrf_field() ?>
                <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
                <div class="col-12">
                    <label class="form-label">Metode Bayar</label>
                    <select name="metode_bayar" class="form-select" required>
                        <?php foreach (['cash', 'transfer', 'e_wallet', 'gateway', 'manual'] as $method): ?>
                            <option value="<?= $method ?>" <?= ($row['metode_bayar'] ?? 'manual') === $method ? 'selected' : '' ?>><?= ucfirst(str_replace('_', ' ', $method)) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="col-12">
                    <label class="form-label">Waktu Pembayaran</label>
                    <input type="datetime-local" name="dibayar_pada" class="form-control" value="<?= date('Y-m-d\TH:i') ?>" required>
                </div>
                <div class="col-12">
                    <label class="form-label">Catatan Pembayaran</label>
                    <textarea name="catatan_pembayaran" class="form-control" rows="4" placeholder="Catatan transfer, referensi, atau keterangan petugas"></textarea>
                </div>
                <div class="col-12">
                    <label class="form-label">Bukti Pembayaran</label>
                    <input type="file" name="bukti_pembayaran" class="form-control" accept=".jpg,.jpeg,.png,.pdf">
                </div>
                <div class="col-12 d-flex justify-content-end">
                    <button class="btn btn-primary">Simpan Pembayaran</button>
                </div>
            </form>
        </div>
    </div>
    <div class="col-lg-7">
        <div class="surface-card h-100">
            <div class="section-title">
                <div>
                    <div class="brand-kicker">Histori</div>
                    <h3>Riwayat Pembayaran</h3>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead><tr><th>Dibayar</th><th>Metode</th><th>Nominal</th><th>Operator</th><th>Bukti</th></tr></thead>
                    <tbody>
                    <?php foreach ($paymentHistory as $payment): ?>
                        <tr>
                            <td><?= htmlspecialchars($payment['dibayar_pada']) ?></td>
                            <td><?= htmlspecialchars($payment['metode_bayar']) ?></td>
                            <td>Rp <?= number_format((float) $payment['jumlah_bayar'], 0, ',', '.') ?></td>
                            <td><?= htmlspecialchars((string) ($payment['nama_lengkap'] ?: '-')) ?></td>
                            <td>
                                <?php if (!empty($payment['bukti_pembayaran'])): ?>
                                    <a href="<?= base_url('/' . $payment['bukti_pembayaran']) ?>" target="_blank" class="btn btn-sm btn-outline-primary">Lihat Bukti</a>
                                <?php else: ?>
                                    <span class="text-muted">-</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if ($paymentHistory === []): ?>
                        <tr><td colspan="5" class="text-center text-muted py-4">Belum ada histori pembayaran.</td></tr>
                    <?php endif; ?>
                    </tbody>
                </table>
            </div>
            <?php if (!empty($row['bukti_pembayaran'])): ?>
                <div class="mt-3">
                    <a href="<?= base_url('/' . $row['bukti_pembayaran']) ?>" target="_blank" class="btn btn-outline-primary">Buka Bukti Terakhir</a>
                </div>
            <?php endif; ?>
        </div>
    </div>
</div>
