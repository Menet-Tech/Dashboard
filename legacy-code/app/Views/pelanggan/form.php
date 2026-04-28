<?php $isEdit = !empty($row); ?>
<div class="surface-card">
    <div class="section-title">
        <div><div class="brand-kicker"><?= $isEdit ? 'Edit Data' : 'Input Baru' ?></div><h3><?= htmlspecialchars($title) ?></h3></div>
        <a href="<?= base_url('/pelanggan') ?>" class="btn btn-outline-secondary">Kembali</a>
    </div>
    <form method="post" action="<?= base_url($isEdit ? '/pelanggan/update' : '/pelanggan/store') ?>" class="row g-3">
        <?= csrf_field() ?>
        <?php if ($isEdit): ?><input type="hidden" name="id" value="<?= (int) $row['id'] ?>"><?php endif; ?>
        <div class="col-md-6"><label class="form-label">Nama</label><input type="text" name="nama" class="form-control" value="<?= htmlspecialchars((string) ($row['nama'] ?? '')) ?>" required></div>
        <div class="col-md-6">
            <label class="form-label">Paket</label>
            <select name="id_paket" class="form-select" required>
                <option value="">Pilih paket</option>
                <?php foreach ($paketList as $paket): ?>
                    <option value="<?= (int) $paket['id'] ?>" <?= (int) ($row['id_paket'] ?? 0) === (int) $paket['id'] ? 'selected' : '' ?>><?= htmlspecialchars($paket['nama_paket']) ?> - Rp <?= number_format((float) $paket['harga'], 0, ',', '.') ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-4"><label class="form-label">User PPPoE</label><input type="text" name="user_pppoe" class="form-control" value="<?= htmlspecialchars((string) ($row['user_pppoe'] ?? '')) ?>" required></div>
        <div class="col-md-4"><label class="form-label">Password PPPoE</label><input type="text" name="pass_pppoe" class="form-control" value="<?= htmlspecialchars((string) ($row['pass_pppoe'] ?? '')) ?>" required></div>
        <div class="col-md-4"><label class="form-label">Nomor WA</label><input type="text" name="no_wa" class="form-control" value="<?= htmlspecialchars((string) ($row['no_wa'] ?? '')) ?>" placeholder="628xxxx" required></div>
        <div class="col-md-4"><label class="form-label">SN ONT</label><input type="text" name="sn_ont" class="form-control" value="<?= htmlspecialchars((string) ($row['sn_ont'] ?? '')) ?>"></div>
        <div class="col-md-4">
            <label class="form-label">Tanggal Jatuh Tempo Bulanan</label>
            <input type="number" name="tgl_jatuh_tempo_day" class="form-control" min="1" max="31" value="<?= (int) ($row['due_day'] ?? date('j')) ?>" required>
            <small class="text-muted">Isi angka tanggal saja, misalnya `8` berarti jatuh tempo setiap tanggal 8 tiap bulan.</small>
        </div>
        <div class="col-md-4">
            <label class="form-label">Status</label>
            <select name="status" class="form-select"><?php foreach (['active', 'limit', 'inactive'] as $status): ?><option value="<?= $status ?>" <?= ($row['status'] ?? 'active') === $status ? 'selected' : '' ?>><?= ucfirst($status) ?></option><?php endforeach; ?></select>
        </div>
        <div class="col-12"><label class="form-label">Alamat</label><textarea name="alamat" class="form-control" rows="3"><?= htmlspecialchars((string) ($row['alamat'] ?? '')) ?></textarea></div>
        <div class="col-md-6"><label class="form-label">Latitude</label><input type="text" name="latitude" id="latitude" class="form-control" value="<?= htmlspecialchars((string) ($row['latitude'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">Longitude</label><input type="text" name="longitude" id="longitude" class="form-control" value="<?= htmlspecialchars((string) ($row['longitude'] ?? '')) ?>"></div>
        <div class="col-12"><div id="pickerMap" class="map-card"></div></div>
        <div class="col-12 d-flex justify-content-end"><button class="btn btn-primary">Simpan Pelanggan</button></div>
    </form>
</div>
