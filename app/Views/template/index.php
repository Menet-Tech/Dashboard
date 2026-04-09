<div class="surface-card">
    <div class="section-title">
        <div><div class="brand-kicker">WhatsApp</div><h3>Template Pesan</h3></div>
        <div class="text-muted">Placeholder: {nama}, {no_wa}, {paket}, {harga}, {periode}, {tgl_jatuh_tempo}, {tanggal_bayar}, {nama_isp}, {no_rekening}</div>
    </div>
    <form method="post" action="<?= base_url('/template-wa/save') ?>" class="row g-4">
        <?= csrf_field() ?>
        <?php foreach ($rows as $index => $row): ?>
            <div class="col-12">
                <input type="hidden" name="id[]" value="<?= (int) $row['id'] ?>">
                <div class="border rounded-4 p-3">
                    <div class="row g-3">
                        <div class="col-md-4"><label class="form-label">Nama Template</label><input type="text" name="nama[]" class="form-control" value="<?= htmlspecialchars($row['nama']) ?>"></div>
                        <div class="col-md-4"><label class="form-label">Trigger</label><input type="text" class="form-control" value="<?= htmlspecialchars($row['trigger_event']) ?>" disabled></div>
                        <div class="col-md-4 d-flex align-items-end">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" name="is_active[<?= $index ?>]" <?= (int) $row['is_active'] === 1 ? 'checked' : '' ?>>
                                <label class="form-check-label">Aktif</label>
                            </div>
                        </div>
                        <div class="col-12"><label class="form-label">Isi Pesan</label><textarea name="isi_pesan[]" class="form-control" rows="6"><?= htmlspecialchars($row['isi_pesan']) ?></textarea></div>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
        <div class="col-12 d-flex justify-content-end"><button class="btn btn-primary">Simpan Template</button></div>
    </form>
</div>
