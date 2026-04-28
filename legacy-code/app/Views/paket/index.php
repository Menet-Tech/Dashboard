<div class="row g-4">
    <div class="col-lg-4">
        <div class="surface-card">
            <div class="section-title">
                <div>
                    <div class="brand-kicker"><?= $editing ? 'Edit Paket' : 'Tambah Paket' ?></div>
                    <h3><?= $editing ? 'Perbarui paket layanan' : 'Tambah paket layanan' ?></h3>
                    <p class="section-subtitle">Atur nama paket, harga, dan profil MikroTik untuk pelanggan.</p>
                </div>
                <?php if ($editing): ?>
                    <a href="<?= base_url('/paket') ?>" class="btn btn-outline-secondary">Batal</a>
                <?php endif; ?>
            </div>
            <form method="post" action="<?= base_url('/paket/save') ?>" class="row g-3">
                <?= csrf_field() ?>
                <?php if ($editing): ?><input type="hidden" name="id" value="<?= (int) $editing['id'] ?>"><?php endif; ?>
                <div class="col-12"><label class="form-label">Nama Paket</label><input type="text" name="nama_paket" class="form-control" value="<?= htmlspecialchars((string) ($editing['nama_paket'] ?? '')) ?>" required></div>
                <div class="col-12"><label class="form-label">Harga</label><input type="number" name="harga" class="form-control" min="0" value="<?= htmlspecialchars((string) ($editing['harga'] ?? '')) ?>" required></div>
                <div class="col-12"><label class="form-label">Profile MikroTik</label><input type="text" name="profile_mikrotik" class="form-control" value="<?= htmlspecialchars((string) ($editing['profile_mikrotik'] ?? '')) ?>" required></div>
                <div class="col-12"><label class="form-label">Profile Limit MikroTik</label><input type="text" name="profile_limit_mikrotik" class="form-control" value="<?= htmlspecialchars((string) ($editing['profile_limit_mikrotik'] ?? '')) ?>" required></div>
                <div class="col-12"><button class="btn btn-primary w-100"><?= $editing ? 'Update Paket' : 'Simpan Paket' ?></button></div>
            </form>
        </div>
    </div>
    <div class="col-lg-8">
        <div class="surface-card">
            <div class="section-title">
                <div>
                    <div class="brand-kicker">Daftar Paket</div>
                    <h3>Master paket aktif</h3>
                    <p class="section-subtitle">Klik edit untuk memuat data ke panel kiri lalu simpan perubahan.</p>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Nama</th><th>Harga</th><th>Profile</th><th>Limit</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($rows as $row): ?>
                        <tr class="<?= $editing && (int) $editing['id'] === (int) $row['id'] ? 'table-active' : '' ?>">
                            <td>
                                <strong><?= htmlspecialchars($row['nama_paket']) ?></strong>
                                <div class="text-muted small">ID Paket #<?= (int) $row['id'] ?></div>
                            </td>
                            <td>Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></td>
                            <td><code><?= htmlspecialchars($row['profile_mikrotik']) ?></code></td>
                            <td><code><?= htmlspecialchars($row['profile_limit_mikrotik']) ?></code></td>
                            <td class="text-end">
                                <a href="<?= base_url('/paket?edit=' . $row['id']) ?>" class="btn btn-sm btn-outline-primary">Edit</a>
                                <form method="post" action="<?= base_url('/paket/delete') ?>" class="d-inline">
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
    </div>
</div>
