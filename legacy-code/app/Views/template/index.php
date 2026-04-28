<div class="surface-card">
    <div class="section-title">
        <div>
            <div class="brand-kicker">WhatsApp</div>
            <h3>Template Pesan</h3>
        </div>
        <div class="text-muted">Placeholder: {nama}, {no_wa}, {paket}, {harga}, {periode}, {tgl_jatuh_tempo}, {tanggal_bayar}, {invoice_number}, {status_pembayaran}, {hari_limit}, {nama_isp}, {no_rekening}</div>
    </div>
    <div class="row g-4">
        <div class="col-lg-4">
            <div class="border rounded-4 p-3 h-100">
                <div class="section-title">
                    <div>
                        <div class="brand-kicker"><?= $editing ? 'Edit' : 'Tambah' ?></div>
                        <h3><?= $editing ? 'Perbarui Template' : 'Tambah Template Baru' ?></h3>
                    </div>
                </div>
                <form method="post" action="<?= base_url('/template-wa/save') ?>" class="row g-3">
                    <?= csrf_field() ?>
                    <?php if ($editing): ?><input type="hidden" name="id" value="<?= (int) $editing['id'] ?>"><?php endif; ?>
                    <div class="col-12"><label class="form-label">Nama Template</label><input type="text" name="nama" class="form-control" value="<?= htmlspecialchars((string) ($editing['nama'] ?? '')) ?>" required></div>
                    <div class="col-12"><label class="form-label">Trigger Event</label><input type="text" name="trigger_event" class="form-control" value="<?= htmlspecialchars((string) ($editing['trigger_event'] ?? '')) ?>" placeholder="contoh: reminder_custom" required></div>
                    <div class="col-12"><label class="form-label">Isi Pesan</label><textarea name="isi_pesan" class="form-control" rows="8" required><?= htmlspecialchars((string) ($editing['isi_pesan'] ?? '')) ?></textarea></div>
                    <div class="col-12">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" name="is_active" <?= ((int) ($editing['is_active'] ?? 1) === 1) ? 'checked' : '' ?>>
                            <label class="form-check-label">Aktif</label>
                        </div>
                    </div>
                    <div class="col-12 d-flex gap-2">
                        <button class="btn btn-primary"><?= $editing ? 'Update Template' : 'Simpan Template' ?></button>
                        <?php if ($editing): ?><a href="<?= base_url('/template-wa') ?>" class="btn btn-outline-secondary">Batal</a><?php endif; ?>
                    </div>
                </form>
            </div>
        </div>
        <div class="col-lg-8">
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead><tr><th>Nama</th><th>Trigger</th><th>Status</th><th>Preview</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($rows as $row): ?>
                        <tr>
                            <td><?= htmlspecialchars($row['nama']) ?></td>
                            <td><code><?= htmlspecialchars($row['trigger_event']) ?></code></td>
                            <td><span class="badge text-bg-<?= (int) $row['is_active'] === 1 ? 'success' : 'secondary' ?>"><?= (int) $row['is_active'] === 1 ? 'Aktif' : 'Nonaktif' ?></span></td>
                            <td class="small text-muted"><?= htmlspecialchars(mb_strimwidth((string) $row['isi_pesan'], 0, 90, '...')) ?></td>
                            <td class="text-end">
                                <a href="<?= base_url('/template-wa?edit=' . $row['id']) ?>" class="btn btn-sm btn-outline-primary">Edit</a>
                                <form method="post" action="<?= base_url('/template-wa/delete') ?>" class="d-inline">
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
