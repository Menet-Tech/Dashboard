<?php
$settings = [];
foreach ($rows as $key => $row) {
    $settings[$key] = $row['value'];
}
$discordPreferences = discordAlertPreferenceDefinitions();
$discordRouteOptions = discordRouteOptions();
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
        <div class="col-md-6"><label class="form-label">WA API Key</label><input type="password" name="wa_api_key" class="form-control" value="<?= htmlspecialchars((string) (\App\Models\Pengaturan::get('wa_api_key', ''))) ?>"></div>
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
        <div class="col-md-4"><label class="form-label">Discord Bot Token</label><input type="password" name="discord_bot_token" class="form-control" value="<?= htmlspecialchars((string) ($settings['discord_bot_token'] ?? '')) ?>"></div>
        <div class="col-md-4"><label class="form-label">Discord Application ID</label><input type="text" name="discord_application_id" class="form-control" value="<?= htmlspecialchars((string) ($settings['discord_application_id'] ?? '')) ?>"></div>
        <div class="col-md-4"><label class="form-label">Discord Guild ID</label><input type="text" name="discord_guild_id" class="form-control" value="<?= htmlspecialchars((string) ($settings['discord_guild_id'] ?? '')) ?>"></div>
        <div class="col-12">
            <div class="integration-test-card">
                <h4>Routing Alert Discord</h4>
                <p>Pilih event mana yang masuk ke channel `alert`, `billing`, keduanya, atau dimatikan.</p>
                <div class="row g-3">
                    <?php foreach ($discordPreferences as $eventKey => $definition): ?>
                        <?php $settingKey = discordAlertPreferenceKey($eventKey); ?>
                        <div class="col-md-6">
                            <label class="form-label"><?= htmlspecialchars($definition['label']) ?></label>
                            <select name="<?= htmlspecialchars($settingKey) ?>" class="form-select">
                                <?php foreach ($discordRouteOptions as $value => $label): ?>
                                    <option value="<?= htmlspecialchars($value) ?>" <?= (($settings[$settingKey] ?? $definition['default']) === $value) ? 'selected' : '' ?>>
                                        <?= htmlspecialchars($label) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <div class="form-text"><?= htmlspecialchars($definition['description']) ?></div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
        <div class="col-md-3"><label class="form-label">MikroTik Host</label><input type="text" name="mikrotik_host" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_host'] ?? '')) ?>"></div>
        <div class="col-md-3"><label class="form-label">MikroTik Port</label><input type="number" name="mikrotik_port" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_port'] ?? '8728')) ?>"></div>
        <div class="col-md-3"><label class="form-label">MikroTik User</label><input type="text" name="mikrotik_user" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_user'] ?? '')) ?>"></div>
        <div class="col-md-3"><label class="form-label">MikroTik Pass</label><input type="password" name="mikrotik_pass" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_pass'] ?? '')) ?>"></div>
        <div class="col-md-6"><label class="form-label">Username Test MikroTik</label><input type="text" name="mikrotik_test_username" class="form-control" value="<?= htmlspecialchars((string) ($settings['mikrotik_test_username'] ?? '')) ?>" placeholder="contoh: test_pppoe"></div>
        <div class="col-md-3">
            <label class="form-label">Auto Generate Billing</label>
            <select name="billing_auto_generate_enabled" class="form-select">
                <option value="true" <?= (($settings['billing_auto_generate_enabled'] ?? 'true') === 'true') ? 'selected' : '' ?>>Aktif</option>
                <option value="false" <?= (($settings['billing_auto_generate_enabled'] ?? 'true') === 'false') ? 'selected' : '' ?>>Nonaktif</option>
            </select>
        </div>
        <div class="col-md-3"><label class="form-label">Hari Auto Generate</label><input type="number" name="billing_auto_generate_day" min="1" max="28" class="form-control" value="<?= htmlspecialchars((string) ($settings['billing_auto_generate_day'] ?? '1')) ?>"></div>
        <div class="col-md-3"><label class="form-label">Jam Auto Generate</label><input type="time" name="billing_auto_generate_time" class="form-control" value="<?= htmlspecialchars((string) ($settings['billing_auto_generate_time'] ?? '00:05')) ?>"></div>
        <div class="col-md-3"><label class="form-label">Limit Setelah (hari)</label><input type="number" name="billing_limit_after_days" min="1" class="form-control" value="<?= htmlspecialchars((string) ($settings['billing_limit_after_days'] ?? '5')) ?>"></div>
        <div class="col-md-3"><label class="form-label">Menunggak Setelah (hari)</label><input type="number" name="billing_menunggak_after_days" min="1" class="form-control" value="<?= htmlspecialchars((string) ($settings['billing_menunggak_after_days'] ?? '30')) ?>"></div>
        <div class="col-md-3"><label class="form-label">Reminder Sebelum Jatuh Tempo</label><input type="number" name="billing_reminder_days_before" min="1" class="form-control" value="<?= htmlspecialchars((string) ($settings['billing_reminder_days_before'] ?? '3')) ?>"></div>
        <div class="col-md-3">
            <label class="form-label">Auto Backup</label>
            <select name="backup_auto_enabled" class="form-select">
                <option value="true" <?= (($settings['backup_auto_enabled'] ?? 'false') === 'true') ? 'selected' : '' ?>>Aktif</option>
                <option value="false" <?= (($settings['backup_auto_enabled'] ?? 'false') === 'false') ? 'selected' : '' ?>>Nonaktif</option>
            </select>
        </div>
        <div class="col-md-3"><label class="form-label">Jam Auto Backup</label><input type="time" name="backup_auto_time" class="form-control" value="<?= htmlspecialchars((string) ($settings['backup_auto_time'] ?? '02:30')) ?>"></div>
        <div class="col-md-3"><label class="form-label">Retensi Backup (hari)</label><input type="number" name="backup_retention_days" min="1" class="form-control" value="<?= htmlspecialchars((string) ($settings['backup_retention_days'] ?? '14')) ?>"></div>
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
                    <p>Mengirim test ke webhook `alert` dan `billing` sekaligus, lalu menampilkan hasilnya.</p>
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
