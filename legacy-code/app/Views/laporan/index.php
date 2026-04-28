<div class="surface-card mb-4">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Laporan Operasional</div>
            <h3>Analitik Billing dan Pelanggan</h3>
            <p class="section-subtitle">Gunakan export CSV untuk dibuka di Excel. Untuk PDF, halaman ini bisa langsung di-print ke PDF dari browser.</p>
        </div>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-12">
        <div class="surface-card">
            <div class="section-title">
                <div><h3>Pendapatan Bulanan</h3></div>
                <a href="<?= base_url('/laporan/export?type=monthly-income') ?>" class="btn btn-outline-primary">Export Excel/CSV</a>
            </div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Bulan</th><th>Total Tagihan</th><th>Terkumpul</th><th>Potensi</th></tr></thead>
                    <tbody><?php foreach ($monthlyIncome as $row): ?><tr><td><?= htmlspecialchars($row['bulan']) ?></td><td><?= (int) $row['total_tagihan'] ?></td><td>Rp <?= number_format((float) $row['pendapatan_terkumpul'], 0, ',', '.') ?></td><td>Rp <?= number_format((float) $row['potensi_pendapatan'], 0, ',', '.') ?></td></tr><?php endforeach; ?></tbody>
                </table>
            </div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><div><h3>Pelanggan Menunggak</h3></div><a href="<?= base_url('/laporan/export?type=outstanding') ?>" class="btn btn-outline-primary">Export Excel/CSV</a></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Nama</th><th>Tagihan</th><th>Nominal</th></tr></thead><tbody><?php foreach ($outstandingCustomers as $row): ?><tr><td><?= htmlspecialchars($row['nama']) ?></td><td><?= (int) $row['total_tunggakan'] ?></td><td>Rp <?= number_format((float) $row['total_nominal'], 0, ',', '.') ?></td></tr><?php endforeach; ?></tbody></table></div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="surface-card">
            <div class="section-title"><div><h3>Jatuh Tempo Minggu Ini</h3></div><a href="<?= base_url('/laporan/export?type=due-this-week') ?>" class="btn btn-outline-primary">Export Excel/CSV</a></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Nama</th><th>Paket</th><th>Due Date</th></tr></thead><tbody><?php foreach ($dueThisWeek as $row): ?><tr><td><?= htmlspecialchars($row['nama']) ?></td><td><?= htmlspecialchars($row['nama_paket']) ?></td><td><?= date('d/m/Y', strtotime($row['due_date'])) ?></td></tr><?php endforeach; ?></tbody></table></div>
        </div>
    </div>
    <div class="col-lg-12">
        <div class="surface-card">
            <div class="section-title"><div><h3>Tunggakan Terlama</h3></div><a href="<?= base_url('/laporan/export?type=longest-overdue') ?>" class="btn btn-outline-primary">Export Excel/CSV</a></div>
            <div class="table-responsive"><table class="table table-hover"><thead><tr><th>Nama</th><th>Tagihan Tertua</th><th>Jumlah</th><th>Nominal</th></tr></thead><tbody><?php foreach ($longestOverdue as $row): ?><tr><td><?= htmlspecialchars($row['nama']) ?></td><td><?= htmlspecialchars((string) $row['tagihan_tertua']) ?></td><td><?= (int) $row['jumlah_tagihan'] ?></td><td>Rp <?= number_format((float) $row['total_nominal'], 0, ',', '.') ?></td></tr><?php endforeach; ?></tbody></table></div>
        </div>
    </div>
</div>
