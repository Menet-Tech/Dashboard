<div class="row g-4">
    <div class="col-lg-4">
        <div class="surface-card">
            <div class="section-title">
                <div>
                    <div class="brand-kicker">User</div>
                    <h3>Tambah User</h3>
                </div>
            </div>
            <form method="post" action="<?= base_url('/users/save') ?>" class="row g-3">
                <?= csrf_field() ?>
                <div class="col-12"><label class="form-label">Nama Lengkap</label><input type="text" name="nama_lengkap" class="form-control" required></div>
                <div class="col-12"><label class="form-label">Username</label><input type="text" name="username" class="form-control" required></div>
                <div class="col-12"><label class="form-label">Password</label><input type="password" name="password" class="form-control" required></div>
                <div class="col-12">
                    <label class="form-label">Role</label>
                    <select name="role" class="form-select">
                        <option value="petugas">Petugas</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div class="col-12"><button class="btn btn-primary w-100">Buat User</button></div>
            </form>
        </div>
    </div>
    <div class="col-lg-8">
        <div class="surface-card">
            <div class="section-title"><h3>Daftar User</h3></div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Last Login</th><th>Status</th></tr></thead>
                    <tbody>
                    <?php foreach ($rows as $row): ?>
                        <tr>
                            <td><?= htmlspecialchars($row['nama_lengkap']) ?></td>
                            <td><?= htmlspecialchars($row['username']) ?></td>
                            <td><?= htmlspecialchars($row['role']) ?></td>
                            <td><?= htmlspecialchars((string) ($row['last_login'] ?: '-')) ?></td>
                            <td><?= (int) $row['is_active'] === 1 ? 'Aktif' : 'Nonaktif' ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
