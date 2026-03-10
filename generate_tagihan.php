<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// Include file konfigurasi database
require_once 'config.php';

$message = '';
$message_type = '';

// Fungsi untuk membuat tagihan otomatis
function generateTagihan($conn) {
    $today = new DateTime();
    $threeDaysLater = new DateTime();
    $threeDaysLater->modify('+3 days');
    
    // Ambil semua pelanggan aktif (active dan limit)
    $sql = "SELECT id, nama, paket_id, jatuh_tempo FROM pelanggan WHERE status IN ('active', 'limit')";
    $result = $conn->query($sql);
    
    $generated_count = 0;
    $skipped_count = 0;
    
    if ($result->num_rows > 0) {
        while($row = $result->fetch_assoc()) {
            $pelanggan_id = $row['id'];
            $jatuh_tempo_hari = $row['jatuh_tempo'];
            
            // Tentukan tanggal jatuh tempo untuk bulan ini
            $tahun_sekarang = $today->format('Y');
            $bulan_sekarang = $today->format('m');
            
            // Cek apakah tanggal jatuh tempo valid untuk bulan ini (menghindari tanggal 31 di bulan yang hanya punya 30 hari)
            $max_hari = cal_days_in_month(CAL_GREGORIAN, $bulan_sekarang, $tahun_sekarang);
            if ($jatuh_tempo_hari > $max_hari) {
                $jatuh_tempo_hari = $max_hari;
            }
            
            $tanggal_jatuh_tempo = new DateTime("$tahun_sekarang-$bulan_sekarang-$jatuh_tempo_hari");
            $tanggal_tagihan = clone $tanggal_jatuh_tempo;
            $tanggal_tagihan->modify('-3 days');
            
            // Cek apakah tagihan untuk tanggal jatuh tempo ini sudah ada
            $check_sql = "SELECT id FROM tagihan WHERE pelanggan_id = ? AND tanggal_jatuh_tempo = ?";
            $check_stmt = $conn->prepare($check_sql);
            $check_date = $tanggal_jatuh_tempo->format('Y-m-d');
            $check_stmt->bind_param("is", $pelanggan_id, $check_date);
            $check_stmt->execute();
            $check_result = $check_stmt->get_result();
            
            if ($check_result->num_rows == 0) {
            // Buat tagihan baru
            $insert_sql = "INSERT INTO tagihan (pelanggan_id, tanggal_tagihan, tanggal_jatuh_tempo) VALUES (?, ?, ?)";
            $insert_stmt = $conn->prepare($insert_sql);
            $tagihan_date = $tanggal_tagihan->format('Y-m-d');
            $jatuh_tempo_date = $tanggal_jatuh_tempo->format('Y-m-d');
            $insert_stmt->bind_param("iss", $pelanggan_id, $tagihan_date, $jatuh_tempo_date);
                
                if ($insert_stmt->execute()) {
                    $generated_count++;
                } else {
                    $message = "Error saat membuat tagihan untuk pelanggan ID: $pelanggan_id";
                    $message_type = "error";
                    return ['success' => false, 'message' => $message, 'generated' => $generated_count, 'skipped' => $skipped_count];
                }
                
                $insert_stmt->close();
            } else {
                $skipped_count++;
            }
            
            $check_stmt->close();
        }
    }
    
    // Update status pelanggan berdasarkan keterlambatan pembayaran
    updateStatusPelanggan($conn);
    
    return ['success' => true, 'message' => 'Tagihan berhasil dibuat', 'generated' => $generated_count, 'skipped' => $skipped_count];
}

// Fungsi untuk update status pelanggan berdasarkan keterlambatan pembayaran
function updateStatusPelanggan($conn) {
    $today = new DateTime();
    
    // Ambil semua tagihan yang belum dibayar (termasuk pelanggan dengan status limit)
    $sql = "SELECT t.pelanggan_id, t.tanggal_jatuh_tempo, p.status 
            FROM tagihan t 
            LEFT JOIN pelanggan p ON t.pelanggan_id = p.id 
            WHERE t.status_bayar = 'belum' AND p.status != 'inactive'";
    $result = $conn->query($sql);
    
    if ($result->num_rows > 0) {
        while($row = $result->fetch_assoc()) {
            $pelanggan_id = $row['pelanggan_id'];
            $tanggal_jatuh_tempo = new DateTime($row['tanggal_jatuh_tempo']);
            $status_sekarang = $row['status'];
            
            // Hitung selisih hari
            $interval = $tanggal_jatuh_tempo->diff($today);
            $hari_terlambat = $interval->days;
            
            // Tentukan status baru berdasarkan keterlambatan
            $status_baru = $status_sekarang;
            
            if ($hari_terlambat >= 7) {
                // Jika terlambat 7 hari atau lebih, status jadi inactive (termasuk dari status limit)
                $status_baru = 'inactive';
            } else if ($hari_terlambat >= 3) {
                // Jika terlambat 3-6 hari, status jadi limit (termasuk dari status active)
                $status_baru = 'limit';
            }
            
            // Update status pelanggan jika berubah
            if ($status_baru != $status_sekarang) {
                $update_sql = "UPDATE pelanggan SET status = ? WHERE id = ?";
                $update_stmt = $conn->prepare($update_sql);
                $update_stmt->bind_param("si", $status_baru, $pelanggan_id);
                $update_stmt->execute();
                $update_stmt->close();
            }
        }
    }
}

// Handle generate tagihan
if (isset($_POST['generate_tagihan'])) {
    $result = generateTagihan($conn);
    
    if ($result['success']) {
        $message = "Tagihan berhasil dibuat! Dibuat: {$result['generated']} tagihan, Dilewati: {$result['skipped']} tagihan";
        $message_type = "success";
    } else {
        $message = $result['message'];
        $message_type = "error";
    }
}

// Handle pembayaran tagihan
if (isset($_POST['bayar_tagihan'])) {
    $tagihan_id = cleanInput($_POST['tagihan_id']);
    $status_bayar = cleanInput($_POST['status_bayar']);

    if (!empty($tagihan_id) && !empty($status_bayar)) {
        $sql = "UPDATE tagihan SET status_bayar = ? WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("si", $status_bayar, $tagihan_id);

        if ($stmt->execute()) {
            $message = "Status pembayaran berhasil diperbarui!";
            $message_type = "success";
            // Redirect untuk refresh halaman dan data
            header("Location: generate_tagihan.php");
            exit();
        } else {
            $message = "Error: " . $stmt->error;
            $message_type = "error";
        }
        $stmt->close();
    } else {
        $message = "Data tidak valid!";
        $message_type = "error";
    }
}

// Ambil data tagihan dari database
$sql = "SELECT t.*, p.nama, pb.name as paket_name, pb.price 
        FROM tagihan t 
        LEFT JOIN pelanggan p ON t.pelanggan_id = p.id 
        LEFT JOIN paket_bandwidth pb ON p.paket_id = pb.id 
        ORDER BY t.tanggal_tagihan DESC, p.nama";
$result = $conn->query($sql);
$tagihans = [];
if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $tagihans[] = [
            'id' => $row['id'],
            'pelanggan_id' => $row['pelanggan_id'],
            'nama' => $row['nama'],
            'paket_name' => $row['paket_name'],
            'tanggal_tagihan' => $row['tanggal_tagihan'],
            'tanggal_jatuh_tempo' => $row['tanggal_jatuh_tempo'],
            'harga' => $row['price'] ?? 0,
            'status_bayar' => $row['status_bayar'] ?? 'belum'
        ];
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generate Tagihan - Mikrotik Management</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
    <style>
        /* Styling tambahan untuk generate tagihan */
        .generate-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e0e0e0;
        }
        
        .generate-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .generate-actions {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        
        .btn-generate {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s;
        }
        
        .btn-generate:hover {
            background-color: #0056b3;
        }
        
        .status-badge {
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .status-belum {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .status-sudah {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .action-btn-group {
            display: flex;
            gap: 5px;
        }
        
        .btn-bayar {
            background-color: #28a745;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.3s;
        }
        
        .btn-bayar:hover {
            background-color: #218838;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .empty-state i {
            font-size: 48px;
            color: #ddd;
            margin-bottom: 15px;
        }
        
        .table-header {
            grid-template-columns: 150px 150px 150px 150px 150px 150px 150px 200px;
        }
        
        .table-body .pool-row {
            grid-template-columns: 150px 150px 150px 150px 150px 150px 150px 200px;
        }
        
        @media (max-width: 1200px) {
            .table-header, .table-body .pool-row {
                grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
            }
        }
        
        @media (max-width: 768px) {
            .generate-actions {
                text-align: center;
            }
            
            .generate-stats {
                grid-template-columns: 1fr 1fr;
            }
        }
        
        @media (max-width: 480px) {
            .generate-stats {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <?php include 'navbar.php'; ?>

    <!-- Main Content Area -->
    <div class="main-content">
        <?php include 'header.php'; ?>

        <div class="content-body">
            <!-- Generate Header -->
            <div class="generate-header">
                <div class="generate-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-file-invoice"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count($tagihans); ?></h3>
                            <span>Total Tagihan</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($tagihans, function($t) { return $t['status_bayar'] == 'belum'; })); ?></h3>
                            <span>Belum Dibayar</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($tagihans, function($t) { return $t['status_bayar'] == 'sudah'; })); ?></h3>
                            <span>Sudah Dibayar</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($tagihans, function($t) { 
                                $today = date('Y-m-d');
                                $jatuh_tempo = $t['tanggal_jatuh_tempo'];
                                return strtotime($jatuh_tempo) >= strtotime($today) && strtotime($jatuh_tempo) <= strtotime($today . ' + 3 days');
                            })); ?></h3>
                            <span>Jatuh Tempo 3 Hari</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Generate Actions -->
            <div class="generate-actions">
                <h3>Generate Tagihan Otomatis</h3>
                <p>Generate tagihan untuk semua pelanggan aktif yang jatuh tempo 3 hari lagi.</p>
                <form method="POST" style="display: inline;">
                    <button type="submit" name="generate_tagihan" class="btn-generate">
                        <i class="fas fa-plus-circle"></i> Generate Tagihan
                    </button>
                </form>
            </div>

            <!-- Message Display -->
            <?php if (!empty($message)): ?>
                <div class="message <?php echo $message_type; ?>">
                    <i class="fas fa-<?php echo $message_type == 'success' ? 'check-circle' : 'exclamation-circle'; ?>"></i>
                    <?php echo $message; ?>
                </div>
            <?php endif; ?>

            <!-- Tagihan Table -->
            <div class="pool-table">
                <div class="table-header">
                    <div>Nama Pelanggan</div>
                    <div>Paket</div>
                    <div>Tanggal Tagihan</div>
                    <div>Tanggal Jatuh Tempo</div>
                    <div>Harga</div>
                    <div>Status Bayar</div>
                    <div>Sisa Hari</div>
                    <div>Aksi</div>
                </div>
                <div class="table-body">
                    <?php if (empty($tagihans)): ?>
                        <div class="empty-state">
                            <i class="fas fa-file-invoice-dollar"></i>
                            <p>Belum ada tagihan yang dikonfigurasi</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($tagihans as $tagihan): ?>
                            <?php 
                            $today = new DateTime();
                            $jatuh_tempo = new DateTime($tagihan['tanggal_jatuh_tempo']);
                            $interval = $today->diff($jatuh_tempo);
                            $sisa_hari = $interval->days;
                            
                            // Tentukan apakah jatuh tempo sudah lewat atau belum
                            $is_past_due = $jatuh_tempo < $today;
                            ?>
                            <div class="pool-row">
                                <div class="pool-name">
                                    <i class="fas fa-user"></i>
                                    <?php echo htmlspecialchars($tagihan['nama']); ?>
                                </div>
                                <div class="pool-range">
                                    <?php echo htmlspecialchars($tagihan['paket_name']); ?>
                                </div>
                                <div class="pool-next">
                                    <?php echo date('d-m-Y', strtotime($tagihan['tanggal_tagihan'])); ?>
                                </div>
                                <div class="pool-comment">
                                    <?php echo date('d-m-Y', strtotime($tagihan['tanggal_jatuh_tempo'])); ?>
                                </div>
                                <div class="pool-price">
                                    <?php echo 'Rp ' . number_format($tagihan['harga'], 0, ',', '.'); ?>
                                </div>
                                <div class="pool-status">
                                    <span class="status-badge <?php echo $tagihan['status_bayar'] == 'sudah' ? 'status-sudah' : 'status-belum'; ?>">
                                        <i class="<?php echo $tagihan['status_bayar'] == 'sudah' ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'; ?>"></i>
                                        <?php echo ucfirst($tagihan['status_bayar']); ?>
                                    </span>
                                </div>
                                <div class="pool-price">
                                    <?php 
                                    if ($is_past_due) {
                                        echo "<span style='color: red;'>-$sisa_hari hari</span>";
                                    } else {
                                        echo "<span style='color: green;'>+$sisa_hari hari</span>";
                                    }
                                    ?>
                                </div>
                                <div class="actions">
                                    <div class="action-btn-group">
                                        <?php if ($tagihan['status_bayar'] == 'belum'): ?>
                                            <form method="POST" style="display: inline;">
                                                <input type="hidden" name="tagihan_id" value="<?php echo $tagihan['id']; ?>">
                                                <input type="hidden" name="status_bayar" value="sudah">
                                                <button type="submit" name="bayar_tagihan" class="btn-bayar" onclick="return confirm('Yakin ingin menandai tagihan ini sebagai sudah dibayar?')">
                                                    <i class="fas fa-check"></i> Sudah
                                                </button>
                                            </form>
                                        <?php else: ?>
                                            <span style="color: green; font-weight: bold;">LUNAS</span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Konfirmasi sebelum generate tagihan
        document.querySelector('.btn-generate').addEventListener('click', function(e) {
            if (!confirm('Yakin ingin generate tagihan untuk semua pelanggan aktif?')) {
                e.preventDefault();
            }
        });
    </script>
</body>
</html>