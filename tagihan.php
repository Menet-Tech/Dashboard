<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// Include file konfigurasi database
require_once 'config.php';

// Handle pembayaran tagihan
$message = '';
$message_type = '';
if (isset($_POST['bayar_tagihan'])) {
    $tagihan_id = cleanInput($_POST['tagihan_id']);
    $status_bayar = cleanInput($_POST['status_bayar']);

    if (!empty($tagihan_id) && !empty($status_bayar)) {
        // Ambil pelanggan_id dari tagihan
        $get_pelanggan_sql = "SELECT pelanggan_id FROM tagihan WHERE id = ?";
        $get_pelanggan_stmt = $conn->prepare($get_pelanggan_sql);
        $get_pelanggan_stmt->bind_param("i", $tagihan_id);
        $get_pelanggan_stmt->execute();
        $get_pelanggan_result = $get_pelanggan_stmt->get_result();
        $tagihan_row = $get_pelanggan_result->fetch_assoc();
        $pelanggan_id = $tagihan_row['pelanggan_id'];
        $get_pelanggan_stmt->close();

        // Update status pembayaran tagihan
        $sql = "UPDATE tagihan SET status_bayar = ?";
        
        // Jika status bayar berubah menjadi "sudah", tambahkan tanggal_bayar
        if ($status_bayar === 'sudah') {
            $tanggal_bayar = formatCustomDate('Y-m-d');
            $sql .= ", tanggal_bayar = ?";
            $stmt = $conn->prepare($sql . " WHERE id = ?");
            $stmt->bind_param("ssi", $status_bayar, $tanggal_bayar, $tagihan_id);
        } else {
            $stmt = $conn->prepare($sql . " WHERE id = ?");
            $stmt->bind_param("si", $status_bayar, $tagihan_id);
        }

        if ($stmt->execute()) {
            $message = "Status pembayaran berhasil diperbarui!";
            $message_type = "success";
            
            // Jika status bayar berubah menjadi "sudah", cek dan update status pelanggan
            if ($status_bayar === 'sudah') {
                // Cek apakah masih ada tagihan yang belum dibayar untuk pelanggan ini
                $check_unpaid_sql = "SELECT COUNT(*) as unpaid_count FROM tagihan WHERE pelanggan_id = ? AND status_bayar = 'belum'";
                $check_unpaid_stmt = $conn->prepare($check_unpaid_sql);
                $check_unpaid_stmt->bind_param("i", $pelanggan_id);
                $check_unpaid_stmt->execute();
                $check_unpaid_result = $check_unpaid_stmt->get_result();
                $unpaid_check = $check_unpaid_result->fetch_assoc();
                $check_unpaid_stmt->close();

                // Jika tidak ada tagihan yang belum dibayar, ubah status pelanggan menjadi active
                if ($unpaid_check['unpaid_count'] == 0) {
                    $update_pelanggan_sql = "UPDATE pelanggan SET status = 'active' WHERE id = ?";
                    $update_pelanggan_stmt = $conn->prepare($update_pelanggan_sql);
                    $update_pelanggan_stmt->bind_param("i", $pelanggan_id);
                    $update_pelanggan_stmt->execute();
                    $update_pelanggan_stmt->close();
                    
                    $message .= " Pelanggan dikembalikan ke status Active.";
                }
            }
            
            $stmt->close();
            // Redirect untuk refresh halaman dan data
            header("Location: tagihan.php");
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
// Cek apakah ada filter pelanggan dari URL
$filter_pelanggan_id = null;
if (isset($_GET['pelanggan_id'])) {
    $filter_pelanggan_id = cleanInput($_GET['pelanggan_id']);
}

// Query untuk menampilkan tagihan
$sql = "SELECT t.*, p.nama, pb.name as paket_name, pb.price 
        FROM tagihan t 
        LEFT JOIN pelanggan p ON t.pelanggan_id = p.id 
        LEFT JOIN paket_bandwidth pb ON p.paket_id = pb.id ";

// Tambahkan WHERE clause jika ada filter
if ($filter_pelanggan_id) {
    $sql .= "WHERE t.pelanggan_id = " . intval($filter_pelanggan_id) . " ";
}

$sql .= "ORDER BY t.tanggal_tagihan DESC, p.nama";

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
            'tanggal_bayar' => $row['tanggal_bayar'] ?? null,
            'harga' => $row['price'] ?? 0,
            'status_bayar' => $row['status_bayar'] ?? 'belum'
        ];
    }
}

// Ambil data pelanggan untuk filter
$sql_pelanggans = "SELECT id, nama FROM pelanggan ORDER BY nama";
$result_pelanggans = $conn->query($sql_pelanggans);
$pelanggan_list = [];
if ($result_pelanggans->num_rows > 0) {
    while($row = $result_pelanggans->fetch_assoc()) {
        $pelanggan_list[] = [
            'id' => $row['id'],
            'nama' => $row['nama']
        ];
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tagihan - Mikrotik Management</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
    <style>
        /* Styling tambahan untuk tagihan */
        .tagihan-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e0e0e0;
        }
        
        .tagihan-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .filter-container {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
        }
        
        .filter-container input,
        .filter-container select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
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
        
        .btn-batal {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.3s;
        }
        
        .btn-batal:hover {
            background-color: #c82333;
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
            .filter-container {
                grid-template-columns: 1fr;
            }
            
            .tagihan-stats {
                grid-template-columns: 1fr 1fr;
            }
        }
        
        @media (max-width: 480px) {
            .tagihan-stats {
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
            <!-- Filter Info -->
            <?php if ($filter_pelanggan_id): ?>
            <div style="padding: 15px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px; margin-bottom: 20px;">
                <i class="fas fa-info-circle"></i>
                <strong>Filter Aktif:</strong> Menampilkan tagihan dari pelanggan ini saja
                <a href="pelanggan.php" style="margin-left: 15px; text-decoration: none; color: #2196F3; font-weight: bold;">
                    <i class="fas fa-arrow-left"></i> Kembali ke Pelanggan
                </a>
            </div>
            <?php endif; ?>

            <!-- Tagihan Header -->
            <div class="tagihan-header">
                <div class="tagihan-stats">
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
                                $today = formatCustomDate('Y-m-d');
                                $jatuh_tempo = $t['tanggal_jatuh_tempo'];
                                return strtotime($jatuh_tempo) >= strtotime($today) && strtotime($jatuh_tempo) <= strtotime($today . ' + 3 days');
                            })); ?></h3>
                            <span>Jatuh Tempo 3 Hari</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filter Container -->
            <div class="filter-container">
                <div>
                    <label for="filter-nama">Filter Nama Pelanggan:</label>
                    <input type="text" id="filter-nama" placeholder="Cari nama pelanggan...">
                </div>
                <div>
                    <label for="filter-paket">Filter Paket:</label>
                    <input type="text" id="filter-paket" placeholder="Cari paket...">
                </div>
                <div>
                    <label for="filter-status">Filter Status Bayar:</label>
                    <select id="filter-status">
                        <option value="">Semua Status</option>
                        <option value="belum">Belum Dibayar</option>
                        <option value="sudah">Sudah Dibayar</option>
                    </select>
                </div>
                <div>
                    <label for="filter-tanggal">Filter Tanggal:</label>
                    <input type="date" id="filter-tanggal">
                </div>
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
                <div class="table-body" id="tagihan-table-body">
                    <?php if (empty($tagihans)): ?>
                        <div class="empty-state">
                            <i class="fas fa-file-invoice-dollar"></i>
                            <p>Belum ada tagihan yang dikonfigurasi</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($tagihans as $tagihan): ?>
                            <?php 
                            // Hitung info pembayaran
                            if ($tagihan['status_bayar'] == 'belum') {
                                $today = getCurrentDateTimeObject();
                                $jatuh_tempo = new DateTime($tagihan['tanggal_jatuh_tempo']);
                                $interval = $today->diff($jatuh_tempo);
                                $sisa_hari = $interval->days;
                                $is_past_due = $jatuh_tempo < $today;
                                
                                // Jika telat, hitung berapa hari tertunggak
                                if ($is_past_due) {
                                    $payment_info = "✗ Tertunggak " . $sisa_hari . " hari";
                                    $payment_class = "color: red;";
                                } else {
                                    $payment_info = "";
                                }
                            } else {
                                // Jika sudah dibayar
                                $sisa_hari = 0;
                                $is_past_due = false;
                                
                                // Hitung info telat/lebih dulu
                                if ($tagihan['tanggal_bayar']) {
                                    $tanggal_bayar = new DateTime($tagihan['tanggal_bayar']);
                                    $tanggal_jatuh_tempo = new DateTime($tagihan['tanggal_jatuh_tempo']);
                                    $selisih = $tanggal_bayar->diff($tanggal_jatuh_tempo);
                                    $hari_selisih = $selisih->days;
                                    
                                    if ($tanggal_bayar <= $tanggal_jatuh_tempo) {
                                        // Bayar sebelum jatuh tempo
                                        $payment_info = "✓ Lebih dulu " . $hari_selisih . " hari";
                                        $payment_class = "color: green;";
                                    } else {
                                        // Bayar setelah jatuh tempo (telat)
                                        $payment_info = "✗ Telat " . $hari_selisih . " hari";
                                        $payment_class = "color: red;";
                                    }
                                } else {
                                    $payment_info = "✓ Sudah Dibayar";
                                    $payment_class = "color: green;";
                                }
                            }
                            ?>
                            <div class="pool-row" 
                                 data-nama="<?php echo strtolower($tagihan['nama']); ?>"
                                 data-paket="<?php echo strtolower($tagihan['paket_name']); ?>"
                                 data-status="<?php echo $tagihan['status_bayar']; ?>"
                                 data-tanggal="<?php echo $tagihan['tanggal_tagihan']; ?>">
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
                                    if ($tagihan['status_bayar'] == 'sudah') {
                                        echo "<span style='font-weight: bold; " . ($payment_class ?? 'color: green;') . "'>" . ($payment_info ?? '✓ Sudah Dibayar') . "</span>";
                                    } else {
                                        if ($is_past_due) {
                                            // Tampilkan info tertunggak
                                            echo "<span style='font-weight: bold; " . ($payment_class ?? 'color: red;') . "'>" . ($payment_info ?? "✗ Tertunggak $sisa_hari hari") . "</span>";
                                        } else {
                                            echo "<span style='color: green;'>+$sisa_hari hari</span>";
                                        }
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
        // Fungsi filter
        function filterTable() {
            const filterNama = document.getElementById('filter-nama').value.toLowerCase();
            const filterPaket = document.getElementById('filter-paket').value.toLowerCase();
            const filterStatus = document.getElementById('filter-status').value;
            const filterTanggal = document.getElementById('filter-tanggal').value;
            
            const rows = document.querySelectorAll('.pool-row');
            
            rows.forEach(row => {
                const nama = row.dataset.nama;
                const paket = row.dataset.paket;
                const status = row.dataset.status;
                const tanggal = row.dataset.tanggal;
                
                const matchesNama = nama.includes(filterNama);
                const matchesPaket = paket.includes(filterPaket);
                const matchesStatus = filterStatus === '' || status === filterStatus;
                const matchesTanggal = filterTanggal === '' || tanggal === filterTanggal;
                
                if (matchesNama && matchesPaket && matchesStatus && matchesTanggal) {
                    row.style.display = 'grid';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        // Event listeners untuk filter
        document.getElementById('filter-nama').addEventListener('input', filterTable);
        document.getElementById('filter-paket').addEventListener('input', filterTable);
        document.getElementById('filter-status').addEventListener('change', filterTable);
        document.getElementById('filter-tanggal').addEventListener('change', filterTable);

        // Fungsi sortir
        function sortTable(column) {
            const rows = Array.from(document.querySelectorAll('.pool-row'));
            const isAscending = !this.classList.contains('sort-asc');
            
            // Reset semua sort indicator
            document.querySelectorAll('.table-header div').forEach(header => {
                header.classList.remove('sort-asc', 'sort-desc');
            });
            
            // Set sort indicator untuk kolom yang dipilih
            this.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
            
            rows.sort((a, b) => {
                let aVal, bVal;
                
                switch(column) {
                    case 'nama':
                        aVal = a.dataset.nama;
                        bVal = b.dataset.nama;
                        break;
                    case 'paket':
                        aVal = a.dataset.paket;
                        bVal = b.dataset.paket;
                        break;
                    case 'status':
                        aVal = a.dataset.status;
                        bVal = b.dataset.status;
                        break;
                    case 'tanggal':
                        aVal = a.dataset.tanggal;
                        bVal = b.dataset.tanggal;
                        break;
                    default:
                        return 0;
                }
                
                if (isAscending) {
                    return aVal.localeCompare(bVal);
                } else {
                    return bVal.localeCompare(aVal);
                }
            });
            
            // Update DOM
            const tableBody = document.getElementById('tagihan-table-body');
            rows.forEach(row => tableBody.appendChild(row));
        }

        // Event listeners untuk sortir
        document.querySelectorAll('.table-header div').forEach(header => {
            header.style.cursor = 'pointer';
            header.addEventListener('click', function() {
                const column = this.textContent.toLowerCase().replace(' ', '_');
                sortTable.call(this, column);
            });
        });
    </script>
</body>
</html>