<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Data Pelanggan</div>
            <h3>Pelanggan Terdaftar</h3>
        </div>
        <a href="<?= base_url('/pelanggan/create') ?>" class="btn btn-primary">Tambah Pelanggan</a>
    </div>
    <form method="get" class="row g-3 mb-3">
        <div class="col-md-6">
            <input type="text" name="q" value="<?= htmlspecialchars($query) ?>" class="form-control" placeholder="Cari nama, PPPoE, atau nomor WA">
        </div>
        <div class="col-md-2">
            <button class="btn btn-outline-primary w-100">Filter</button>
        </div>
    </form>
    <div class="table-responsive">
        <table class="table table-hover align-middle">
            <thead>
            <tr><th>Nama</th><th>Paket</th><th>PPPoE</th><th>WA</th><th>SN ONT</th><th>Jatuh Tempo</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
            <?php foreach ($rows as $row): ?>
                <tr>
                    <td><a href="<?= base_url('/pelanggan/show?id=' . $row['id']) ?>" class="fw-semibold text-decoration-none"><?= htmlspecialchars($row['nama']) ?></a></td>
                    <td><?= htmlspecialchars($row['nama_paket']) ?></td>
                    <td><?= htmlspecialchars($row['user_pppoe']) ?></td>
                    <td><?= htmlspecialchars($row['no_wa']) ?></td>
                    <td>
                        <div class="d-flex gap-2 align-items-center">
                            <span><?= htmlspecialchars((string) ($row['sn_ont'] ?: '-')) ?></span>
                            <?php if (!empty($row['sn_ont'])): ?><button class="btn btn-sm btn-outline-secondary copy-btn" data-copy="<?= htmlspecialchars($row['sn_ont']) ?>">Copy</button><?php endif; ?>
                        </div>
                    </td>
                    <td>Tanggal <?= (int) ($row['due_day'] ?? 1) ?></td>
                    <td><span class="badge text-bg-<?= $row['status'] === 'active' ? 'success' : ($row['status'] === 'limit' ? 'warning' : 'secondary') ?>"><?= htmlspecialchars($row['status']) ?></span></td>
                    <td class="text-end">
                        <a href="<?= base_url('/pelanggan/show?id=' . $row['id']) ?>" class="btn btn-sm btn-outline-secondary">Lihat</a>
                        <a href="<?= base_url('/pelanggan/edit?id=' . $row['id']) ?>" class="btn btn-sm btn-outline-primary">Edit</a>
                        <form method="post" action="<?= base_url('/pelanggan/delete') ?>" class="d-inline">
                            <?= csrf_field() ?>
                            <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
                            <button class="btn btn-sm btn-outline-danger confirm-delete">Hapus</button>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
