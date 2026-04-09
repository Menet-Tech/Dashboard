<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}
require_once '../config.php';
require_once '../includes/wa_helper.php';

$message = '';
$message_type = '';

// Handle save template
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_template'])) {
    $jenis = $_POST['jenis'] ?? '';
    $judul = $_POST['judul'] ?? '';
    $isi_pesan = $_POST['isi_pesan'] ?? '';

    if (!empty($jenis) && !empty($judul) && !empty($isi_pesan)) {
        $stmt = $conn->prepare(
            "INSERT INTO wa_templates (jenis, judul, isi_pesan) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE judul = VALUES(judul), isi_pesan = VALUES(isi_pesan)"
        );
        $stmt->bind_param("sss", $jenis, $judul, $isi_pesan);
        if ($stmt->execute()) {
            $message = "Template " . ucfirst($jenis) . " berhasil disimpan!";
            $message_type = "success";
        } else {
            $message = "Gagal menyimpan template: " . $stmt->error;
            $message_type = "error";
        }
        $stmt->close();
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Ambil semua templates
$templates = [];
$res = $conn->query("SELECT * FROM wa_templates");
while ($row = $res->fetch_assoc()) {
    $templates[$row['jenis']] = $row;
}

// Variabel default jika belum ada di DB
$jenis_list = [
    'tagihan' => 'Template Tagihan (Generate Bulanan)',
    'pembayaran' => 'Template Pembayaran (Konfirmasi Lunas)',
    'peringatan' => 'Template Peringatan (Jatuh Tempo)'
];

?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Template WA - Billing System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="../assets/css/style.css">
    <style>
        .template-card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 12px rgba(0,0,0,.05); border-left: 5px solid #667eea; }
        .template-card.pembayaran { border-left-color: #28a745; }
        .template-card.peringatan { border-left-color: #dc3545; }
        
        .template-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #333; display: flex; align-items: center; gap: 8px; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #555; }
        .form-group input, .form-group textarea { width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 14px; focus: outline-none; focus: border-color: #667eea; transition: border-color .2s; }
        .form-group textarea { resize: vertical; min-height: 150px; font-family: inherit; }
        
        .variable-list { background: #f8f9fa; padding: 12px; border-radius: 8px; margin-top: 10px; }
        .variable-list h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: #666; }
        .variable-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .v-tag { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; }
        .v-tag:hover { background: #cbd5e1; }
        
        .btn-save { background: #667eea; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .2s; }
        .btn-save:hover { background: #5a6fd6; }
        
        .preview-box { background: #e5ddd5; border-radius: 10px; padding: 15px; margin-top: 15px; position: relative; max-width: 400px; }
        .wa-bubble { background: #fff; border-radius: 8px; padding: 10px; position: relative; font-size: 13px; line-height: 1.5; white-space: pre-wrap; box-shadow: 0 1px 1px rgba(0,0,0,.1); }
        .wa-bubble:after { content: ''; position: absolute; left: -8px; top: 0; border: 8px solid transparent; border-top-color: #fff; }
    </style>
</head>
<body>
    <?php include '../includes/navbar.php'; ?>
    <div class="main-content">
        <?php include '../includes/header.php'; ?>
        <div class="content-body">
            <div style="margin-bottom:20px;">
                <h2 style="font-size:20px;font-weight:700;color:#333;"><i class="fas fa-file-code"></i> Template Pesan WhatsApp</h2>
                <p style="color:#666;font-size:13px;">Gunakan variabel untuk mengisi data pelanggan secara otomatis.</p>
            </div>

            <?php if ($message): ?>
            <div class="message <?php echo $message_type; ?>" style="padding:12px; border-radius:8px; margin-bottom:20px; background: <?php echo $message_type == 'success' ? '#d4edda' : '#f8d7da'; ?>; color: <?php echo $message_type == 'success' ? '#155724' : '#721c24'; ?>;">
                <i class="fas fa-<?php echo $message_type === 'success' ? 'check-circle' : 'exclamation-circle'; ?>"></i>
                <?php echo htmlspecialchars($message); ?>
            </div>
            <?php endif; ?>

            <div class="templates-grid">
                <?php foreach ($jenis_list as $jenis => $label): ?>
                <?php 
                    $t = $templates[$jenis] ?? [
                        'judul' => $label,
                        'isi_pesan' => ''
                    ];
                ?>
                <div class="template-card <?php echo $jenis; ?>">
                    <h3><i class="fas fa-<?php 
                        if ($jenis == 'tagihan') echo 'file-invoice';
                        elseif ($jenis == 'pembayaran') echo 'check-double';
                        else echo 'exclamation-triangle';
                    ?>"></i> <?php echo $label; ?></h3>
                    
                    <form method="POST">
                        <input type="hidden" name="jenis" value="<?php echo $jenis; ?>">
                        <div class="form-group">
                            <label>Judul Template</label>
                            <input type="text" name="judul" value="<?php echo htmlspecialchars($t['judul']); ?>" required>
                        </div>
                        <div class="form-group">
                            <label>Isi Pesan WA</label>
                            <textarea name="isi_pesan" id="text_<?php echo $jenis; ?>" required><?php echo htmlspecialchars($t['isi_pesan']); ?></textarea>
                            
                            <div class="variable-list">
                                <h4>Variabel Klik untuk Tambah:</h4>
                                <div class="variable-tags">
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{nama}')">{nama}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{no_wa}')">{no_wa}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{paket}')">{paket}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{harga}')">{harga}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{bulan}')">{bulan}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{jatuh_tempo}')">{jatuh_tempo}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{tanggal_bayar}')">{tanggal_bayar}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{nama_isp}')">{nama_isp}</button>
                                    <button type="button" class="v-tag" onclick="insertVar('<?php echo $jenis; ?>', '{no_rekening}')">{no_rekening}</button>
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <button type="submit" name="save_template" class="btn-save">
                                <i class="fas fa-save"></i> Simpan Template
                            </button>
                            <span style="font-size:11px; color:#999;">Terakhir update: <?php echo $t['updated_at'] ?? '-'; ?></span>
                        </div>
                    </form>

                    <!-- Preview box could be added here later with JS -->
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <script>
        function insertVar(jenis, variable) {
            const textarea = document.getElementById('text_' + jenis);
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + variable + text.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        }
    </script>
</body>
</html>
