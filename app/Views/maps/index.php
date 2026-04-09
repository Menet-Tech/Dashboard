<div class="surface-card">
    <div class="section-title">
        <div><div class="brand-kicker">Geo View</div><h3>Peta Pelanggan</h3></div>
        <div class="legend-list">
            <span class="legend green">Aktif</span>
            <span class="legend yellow">Jatuh tempo 7 hari</span>
            <span class="legend red">Limit</span>
            <span class="legend gray">Inactive</span>
        </div>
    </div>
    <div id="customerMap" class="map-card tall"></div>
</div>
<script>window.customerMapData = <?= json_encode($rows, JSON_UNESCAPED_UNICODE) ?>;</script>
