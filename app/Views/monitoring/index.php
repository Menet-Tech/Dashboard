<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Monitoring</div>
            <h3>Status Integrasi dan Error Terkini</h3>
        </div>
    </div>
    <div class="row g-4">
        <?php foreach ($statuses as $name => $status): ?>
            <div class="col-lg-3">
                <div class="stat-card">
                    <span><?= ucwords(str_replace('_', ' ', $name)) ?></span>
                    <strong><?= $status['success'] ? 'OK' : 'Issue' ?></strong>
                    <small><?= htmlspecialchars($status['message']) ?></small>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Health Check Terkini</h3></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Service</th><th>Status</th><th>Message</th><th>Checked</th></tr></thead><tbody><?php foreach ($healthChecks as $row): ?><tr><td><?= htmlspecialchars($row['service_name']) ?></td><td><?= htmlspecialchars($row['status']) ?></td><td><?= htmlspecialchars((string) $row['message']) ?></td><td><?= htmlspecialchars($row['checked_at']) ?></td></tr><?php endforeach; ?></tbody></table></div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><h3>Log Error Terpusat</h3></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Aksi</th><th>Pesan</th><th>Waktu</th></tr></thead><tbody><?php foreach ($recentErrors as $row): ?><tr><td><?= htmlspecialchars($row['tipe_aksi']) ?></td><td><?= htmlspecialchars((string) $row['pesan']) ?></td><td><?= htmlspecialchars($row['created_at']) ?></td></tr><?php endforeach; ?></tbody></table></div>
        </div>
    </div>
</div>
