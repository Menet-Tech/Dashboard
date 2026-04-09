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
                <?php foreach (['belum_bayar', 'menunggu_wa', 'lunas'] as $status): ?>
                    <option value="<?= $status ?>" <?= $filters['status'] === $status ? 'selected' : '' ?>><?= ucfirst(str_replace('_', ' ', $status)) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-2"><button class="btn btn-outline-primary w-100">Terapkan</button></div>
    </form>
    <div class="table-responsive">
        <table class="table table-hover align-middle datatable">
            <thead><tr><th>Pelanggan</th><th>Periode</th><th>Jatuh Tempo</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
            <?php foreach ($rows as $row): ?>
                <?php
                $template = \App\Models\TemplateWA::getByTrigger('jatuh_tempo');
                $msg = \App\Models\TemplateWA::parse($template['isi_pesan'] ?? 'Halo {nama}', $row);
                $waMeUrl = 'https://wa.me/' . $row['no_wa'] . '?text=' . urlencode($msg);
                ?>
                <tr>
                    <td>
                        <a href="<?= base_url('/pelanggan/show?id=' . $row['id_pelanggan']) ?>" class="fw-semibold text-decoration-none"><?= htmlspecialchars($row['nama']) ?></a>
                        <div class="text-muted small"><?= htmlspecialchars($row['nama_paket']) ?></div>
                    </td>
                    <td><?= date('F Y', strtotime($row['periode'])) ?></td>
                    <td><?= date('d/m/Y', strtotime($row['tgl_jatuh_tempo'])) ?></td>
                    <td>Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></td>
                    <td><span class="badge text-bg-<?= $row['status'] === 'lunas' ? 'success' : ($row['status'] === 'menunggu_wa' ? 'warning' : 'secondary') ?>"><?= htmlspecialchars($row['status']) ?></span></td>
                    <td>
                        <?php if ($row['status'] !== 'lunas'): ?><button class="btn btn-sm btn-primary ajax-paid" data-id="<?= (int) $row['id'] ?>">Lunas</button><?php endif; ?>
                        <a href="<?= base_url('/tagihan/show?id=' . $row['id']) ?>" class="btn btn-sm btn-outline-primary">Detail Tagihan</a>
                        <a href="<?= base_url('/pelanggan/show?id=' . $row['id_pelanggan']) ?>" class="btn btn-sm btn-outline-secondary">Info Pelanggan</a>
                        <a href="<?= htmlspecialchars($waMeUrl) ?>" target="_blank" class="btn btn-sm btn-outline-success">WA Me</a>
                        <button class="btn btn-sm btn-outline-dark ajax-wa" data-id="<?= (int) $row['id'] ?>" data-trigger="<?= $row['status'] === 'lunas' ? 'lunas' : 'jatuh_tempo' ?>">WA Gateway</button>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
