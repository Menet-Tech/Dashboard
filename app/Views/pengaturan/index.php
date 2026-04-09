<?php
$settings = [];
foreach ($rows as $key => $row) {
    $settings[$key] = $row['value'];
}
?>
<div class="surface-card">
    <div class="section-title">
        <div><div class="brand-kicker">Konfigurasi</div><h3>Pengaturan Sistem</h3></div>
    </div>
    <form method="post" action="<?= base_url('/pengaturan/save') ?>" class="row g-3">
        <?= csrf_field() ?>
        <div class="col-md-6"><label class="form-label">Nama ISP</label><input type="text" name="nama_isp" class="form-control" value="<?= htmlspecialchars((string) ($settings['nama_isp'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">No Rekening</label><input type="text" name="no_rekening" class="form-control" value="<?= htmlspecialchars((string) ($settings['no_rekening'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">WA Gateway URL</label><input type="url" name="wa_gateway_url" class="form-control" value="<?= htmlspecialchars((string) (\App\Models\Pengaturan::get('wa_gateway_url', 'http://localhost:3000'))) ?>"></div>
        <div class="col-md-6"><label class="form-label">WA API Key</label><input type="text" name="wa_api_key" class="form-control" value="<?= htmlspecialchars((string) (\App\Models\Pengaturan::get('wa_api_key', ''))) ?>"></div>
        <div class="col-md-6"><label class="form-label">WA Account ID</label><input type="text" name="wa_account_id" class="form-control" value="<?= htmlspecialchars((string) (\App\Models\Pengaturan::get('wa_account_id', 'default'))) ?>"></div>
        <div class="col-md-6"><label class="form-label">Nomor Test WhatsApp</label><input type="text" name="wa_test_number" class="form-control" value="<?= htmlspecialchars((string) ($settings['wa_test_number'] ?? '')) ?>" placeholder="628xxxx"></div>
        <div class="col-md-6">
            <label class="form-label">Fallback wa.me</label>
            <select name="wa_fallback_wa_me" class="form-select">
                <?php foreach (['true', 'false'] as $value): ?><option value="<?= $value ?>" <?= \App\Models\Pengaturan::get('wa_fallback_wa_me', 'true') === $value ? 'selected' : '' ?>><?= strtoupper($value) ?></option><?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-6"><label class="form-label">Discord Billing URL</label><input type="url" name="discord_billing_url" class="form-control" value="<?= htmlspecialchars((string) ($settings['discord_billing_url'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">Discord Alert URL</label><input type="url" name="discord_alert_url" class="form-control" value="<?= htmlspecialchars((string) ($settings['discord_alert_url'] ?? '')) ?>"></div>
        <div class="col-md-4"><label class="form-label">MikroTik Host</label><input type="text" name="mikrotik_host" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_host'] ?? '')) ?>"></div>
        <div class="col-md-4"><label class="form-label">MikroTik User</label><input type="text" name="mikrotik_user" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_user'] ?? '')) ?>"></div>
        <div class="col-md-4"><label class="form-label">MikroTik Pass</label><input type="text" name="mikrotik_pass" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_pass'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">Username Test MikroTik</label><input type="text" name="mikrotik_test_username" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_test_username'] ?? '')) ?>" placeholder="contoh: test_pppoe"></div>
        <div class="col-12 d-flex justify-content-end"><button class="btn btn-primary">Simpan Pengaturan</button></div>
    </form>
</div>

<div class="surface-card mt-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Tes Integrasi</div>
            <h3>Cek koneksi layanan</h3>
            <p class="section-subtitle">Simpan pengaturan dulu, lalu jalankan tes untuk memastikan integrasi siap dipakai.</p>
        </div>
    </div>
    <div class="row g-3">
        <div class="col-md-4">
            <form method="post" action="<?= base_url('/pengaturan/test-wa') ?>" class="h-100">
                <?= csrf_field() ?>
                <div class="integration-test-card">
                    <h4>Test WhatsApp</h4>
                    <p>Mengirim pesan ke nomor test yang tersimpan di pengaturan.</p>
                    <button class="btn btn-outline-primary w-100">Kirim Test WA</button>
                </div>
            </form>
        </div>
        <div class="col-md-4">
            <form method="post" action="<?= base_url('/pengaturan/test-discord') ?>" class="h-100">
                <?= csrf_field() ?>
                <div class="integration-test-card">
                    <h4>Test Discord</h4>
                    <p>Mengirim pesan ke webhook alert, atau webhook billing jika alert kosong.</p>
                    <button class="btn btn-outline-primary w-100">Kirim Test Discord</button>
                </div>
            </form>
        </div>
        <div class="col-md-4">
            <form method="post" action="<?= base_url('/pengaturan/test-mikrotik') ?>" class="h-100">
                <?= csrf_field() ?>
                <div class="integration-test-card">
                    <h4>Test MikroTik</h4>
                    <p>Memvalidasi konfigurasi MikroTik yang tersimpan dan mode integrasi saat ini.</p>
                    <button class="btn btn-outline-primary w-100">Cek MikroTik</button>
                </div>
            </form>
        </div>
    </div>
</div>
