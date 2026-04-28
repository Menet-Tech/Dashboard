<?php
$primaryPayment = $paymentHistory[0] ?? null;
$invoiceNumber = $row['invoice_number'] ?? ('INV-' . date('Ym', strtotime((string) ($row['tgl_bayar'] ?? $row['periode']))) . '-' . str_pad((string) $row['id'], 5, '0', STR_PAD_LEFT));
?>
<div class="surface-card invoice-card">
    <div class="section-title">
        <div>
            <div class="brand-kicker">Invoice</div>
            <h3><?= htmlspecialchars((string) $namaIsp) ?></h3>
            <p class="section-subtitle">Bukti pembayaran resmi untuk tagihan yang sudah lunas.</p>
        </div>
        <div class="d-flex gap-2 no-print">
            <button type="button" class="btn btn-primary" onclick="window.print()">Cetak Invoice</button>
            <a href="<?= base_url('/tagihan/show?id=' . $row['id']) ?>" class="btn btn-outline-secondary">Kembali</a>
        </div>
    </div>

    <div class="invoice-meta">
        <div>
            <span>Invoice No</span>
            <strong><?= htmlspecialchars($invoiceNumber) ?></strong>
        </div>
        <div>
            <span>Tanggal Bayar</span>
            <strong><?= htmlspecialchars((string) ($row['tgl_bayar'] ?: '-')) ?></strong>
        </div>
        <div>
            <span>Periode</span>
            <strong><?= htmlspecialchars(date('F Y', strtotime($row['periode']))) ?></strong>
        </div>
    </div>

    <div class="row g-4 mt-1">
        <div class="col-lg-6">
            <div class="invoice-panel">
                <span>Ditagihkan Kepada</span>
                <strong><?= htmlspecialchars($row['nama']) ?></strong>
                <p class="mb-1"><?= htmlspecialchars((string) $row['nama_paket']) ?></p>
                <p class="mb-1">PPPoE: <?= htmlspecialchars((string) $row['user_pppoe']) ?></p>
                <p class="mb-0">WA: <?= htmlspecialchars((string) $row['no_wa']) ?></p>
            </div>
        </div>
        <div class="col-lg-6">
            <div class="invoice-panel">
                <span>Penerimaan</span>
                <strong><?= htmlspecialchars((string) $namaIsp) ?></strong>
                <p class="mb-1">Rekening: <?= htmlspecialchars((string) $noRekening) ?></p>
                <p class="mb-1">Metode: <?= htmlspecialchars(ucfirst(str_replace('_', ' ', (string) ($row['metode_bayar'] ?: ($primaryPayment['metode_bayar'] ?? 'manual'))))) ?></p>
                <p class="mb-0">Operator: <?= htmlspecialchars((string) ($primaryPayment['nama_lengkap'] ?? 'Petugas')) ?></p>
            </div>
        </div>
    </div>

    <div class="table-responsive mt-4">
        <table class="table table-hover align-middle">
            <thead>
            <tr>
                <th>Deskripsi</th>
                <th>Jatuh Tempo</th>
                <th>Status</th>
                <th class="text-end">Nominal</th>
            </tr>
            </thead>
            <tbody>
            <tr>
                <td>Tagihan internet <?= htmlspecialchars(date('F Y', strtotime($row['periode']))) ?> - <?= htmlspecialchars((string) $row['nama_paket']) ?></td>
                <td><?= htmlspecialchars(date('d/m/Y', strtotime($row['tgl_jatuh_tempo']))) ?></td>
                <td><span class="badge text-bg-success">Lunas</span></td>
                <td class="text-end">Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></td>
            </tr>
            </tbody>
            <tfoot>
            <tr>
                <th colspan="3" class="text-end">Total Dibayar</th>
                <th class="text-end">Rp <?= number_format((float) $row['harga'], 0, ',', '.') ?></th>
            </tr>
            </tfoot>
        </table>
    </div>

    <?php if (!empty($row['catatan_pembayaran'])): ?>
        <div class="invoice-note mt-3">
            <span>Catatan Pembayaran</span>
            <p><?= nl2br(htmlspecialchars((string) $row['catatan_pembayaran'])) ?></p>
        </div>
    <?php endif; ?>
</div>
