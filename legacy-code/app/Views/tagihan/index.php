<div class="surface-card">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Billing</div>
            <h3>Daftar Tagihan</h3>
            <p class="section-subtitle">Generate tagihan per periode secara manual lalu pantau pembayaran dari satu tempat.</p>
        </div>
    </div>
    <form method="post" action="<?= base_url('/tagihan/generate') ?>" class="row g-3 mb-4">
        <?= csrf_field() ?>
        <div class="col-md-3">
            <label class="form-label">Generate Periode</label>
            <input type="month" name="periode_generate" value="<?= htmlspecialchars($defaultPeriode) ?>" class="form-control" required>
        </div>
        <div class="col-md-3 d-flex align-items-end">
            <button class="btn btn-primary w-100">Generate Tagihan</button>
        </div>
    </form>
    <form method="get" class="row g-3 mb-3">
        <div class="col-md-3"><input type="month" name="periode" value="<?= htmlspecialchars($filters['periode']) ?>" class="form-control"></div>
        <div class="col-md-3">
            <select name="status" class="form-select">
                <option value="">Semua status</option>
                <?php foreach (['belum_bayar' => 'Belum Bayar', 'lunas' => 'Lunas'] as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $filters['status'] === $val ? 'selected' : '' ?>><?= $label ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-2"><button class="btn btn-outline-primary w-100">Terapkan</button></div>
    </form>
    <div class="table-responsive">
        <table class="table table-hover align-middle datatable">
            <thead><tr><th>Pelanggan</th><th>Invoice</th><th>Periode</th><th>Jatuh Tempo</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
            <?php foreach ($rows as $row): ?>
                <?php
                $displayStatus = $row['display_status'] ?? \App\Models\Tagihan::computeDisplayStatus($row);
                $badgeClass    = \App\Models\Tagihan::displayStatusBadge($displayStatus);
                $badgeLabel    = \App\Models\Tagihan::displayStatusLabel($displayStatus);
                ?>
                <tr>
                    <td>
                        <a href="<?= base_url('/pelanggan/show?id=' . $row['id_pelanggan']) ?>" class="fw-semibold text-decoration-none"><?= htmlspecialchars($row['nama']) ?></a>
                        <div class="text-muted small"><?= htmlspecialchars($row['nama_paket']) ?></div>
                    </td>
                    <td>
                        <div class="fw-semibold"><?= htmlspecialchars((string) ($row['invoice_number'] ?? '-')) ?></div>
                        <div class="small text-muted"><?= $row['status'] === 'lunas' ? 'Sudah dibayar' : 'Belum dibayar' ?></div>
                    </td>
                    <td><?= date('F Y', strtotime($row['periode'])) ?></td>
                    <td><?= date('d/m/Y', strtotime($row['tgl_jatuh_tempo'])) ?></td>
                    <td>Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></td>
                    <td><span class="badge text-bg-<?= $badgeClass ?>"><?= $badgeLabel ?></span></td>
                    <td>
                        <?php if ($row['status'] !== 'lunas'): ?><button class="btn btn-sm btn-primary ajax-paid" data-id="<?= (int) $row['id'] ?>">Lunas</button><?php endif; ?>
                        <a href="<?= base_url('/tagihan/show?id=' . $row['id']) ?>" class="btn btn-sm btn-outline-primary">Detail Tagihan</a>
                        <a href="<?= base_url('/pelanggan/show?id=' . $row['id_pelanggan']) ?>" class="btn btn-sm btn-outline-secondary">Info Pelanggan</a>
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-outline-dark dropdown-toggle" data-bs-toggle="dropdown">Kirim WA</button>
                            <ul class="dropdown-menu">
                                <li><button type="button" class="dropdown-item ajax-wa" data-id="<?= (int) $row['id'] ?>" data-trigger="reminder_custom">Reminder</button></li>
                                <li><button type="button" class="dropdown-item ajax-wa" data-id="<?= (int) $row['id'] ?>" data-trigger="jatuh_tempo">Jatuh Tempo Hari Ini</button></li>
                                <li><button type="button" class="dropdown-item ajax-wa" data-id="<?= (int) $row['id'] ?>" data-trigger="limit_5hari">Batas 5 Hari</button></li>
                                <li><button type="button" class="dropdown-item ajax-wa" data-id="<?= (int) $row['id'] ?>" data-trigger="lunas">Pembayaran Lunas</button></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
