<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}

// Include file konfigurasi database
require_once '../config.php';

// Handle tambah IP Pool
$message = '';
$message_type = '';
if (isset($_POST['add_pool'])) {
    $name = cleanInput($_POST['name']);
    $start_ip = cleanInput($_POST['start_ip']);
    $end_ip = cleanInput($_POST['end_ip']);
    
    if (!empty($name) && !empty($start_ip) && !empty($end_ip)) {
        // Validasi format IP
        if (!validateIP($start_ip) || !validateIP($end_ip)) {
            $message = "Format IP address tidak valid!";
            $message_type = "error";
        } else {
            $sql = "INSERT INTO ip_pools (name, start_ip, end_ip) VALUES (?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sss", $name, $start_ip, $end_ip);
            
            if ($stmt->execute()) {
                $message = "IP Pool berhasil ditambahkan!";
                $message_type = "success";
                // Redirect untuk refresh halaman dan data
                header("Location: pool.php");
                exit();
            } else {
                $message = "Error: " . $stmt->error;
                $message_type = "error";
            }
            $stmt->close();
        }
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle edit IP Pool
if (isset($_POST['edit_pool'])) {
    $id = cleanInput($_POST['id']);
    $name = cleanInput($_POST['name']);
    $start_ip = cleanInput($_POST['start_ip']);
    $end_ip = cleanInput($_POST['end_ip']);
    
    if (!empty($id) && !empty($name) && !empty($start_ip) && !empty($end_ip)) {
        // Validasi format IP
        if (!validateIP($start_ip) || !validateIP($end_ip)) {
            $message = "Format IP address tidak valid!";
            $message_type = "error";
        } else {
            $sql = "UPDATE ip_pools SET name = ?, start_ip = ?, end_ip = ? WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sssi", $name, $start_ip, $end_ip, $id);
            
            if ($stmt->execute()) {
                $message = "IP Pool berhasil diperbarui!";
                $message_type = "success";
                // Redirect untuk refresh halaman dan data
                header("Location: pool.php");
                exit();
            } else {
                $message = "Error: " . $stmt->error;
                $message_type = "error";
            }
            $stmt->close();
        }
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle hapus IP Pool
if (isset($_GET['delete'])) {
    $id = cleanInput($_GET['delete']);
    $sql = "DELETE FROM ip_pools WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        $message = "IP Pool berhasil dihapus!";
        $message_type = "success";
        // Redirect untuk refresh halaman dan data
        header("Location: pool.php");
        exit();
    } else {
        $message = "Error: " . $stmt->error;
        $message_type = "error";
    }
    $stmt->close();
}

// Ambil data IP Pool dari database
$sql = "SELECT * FROM ip_pools ORDER BY name";
$result = $conn->query($sql);
$pools = [];
if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $pools[] = [
            'name' => $row['name'],
            'ranges' => $row['start_ip'] . '-' . $row['end_ip'],
            'next_pool' => '', // bisa ditambahkan field next_pool di database jika diperlukan
            'comment' => 'Pool ' . $row['name'] . ' (' . $row['start_ip'] . ' - ' . $row['end_ip'] . ')'
        ];
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pool - Mikrotik Management</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <div class="overlay" id="overlay"></div>
    <?php include '../navbar.php'; ?>

    <!-- Main Content Area -->
    <div class="main-content">
        <?php include '../header.php'; ?>

        <div class="content-body">
            <!-- Pool Header -->
            <div class="pool-header">
                <div class="pool-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count($pools); ?></h3>
                            <span>Total Pool</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-network-wired"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pools, function($p) { return !empty($p['next_pool']); })); ?></h3>
                            <span>Pool Terhubung</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-comment"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pools, function($p) { return !empty($p['comment']); })); ?></h3>
                            <span>Dengan Keterangan</span>
                        </div>
                    </div>
                </div>
                <button class="btn btn-add" onclick="showAddForm()">
                    <i class="fas fa-plus"></i> Tambah Pool
                </button>
            </div>

            <!-- Add Pool Form -->
            <div id="add-form-container" class="form-container" style="display: none;">
                <div class="form-header">
                    <h3>Tambah IP Pool Baru</h3>
                    <button class="close-btn" onclick="hideAddForm()">&times;</button>
                </div>
                <form id="add-pool-form" method="POST" action="">
                    <div class="form-group">
                        <div>
                            <label for="add-name">Nama Pool:</label>
                            <input type="text" id="add-name" name="name" placeholder="Contoh: pool-dhcp-1" required>
                        </div>
                        <div>
                            <label for="add-start-ip">Start IP:</label>
                            <input type="text" id="add-start-ip" name="start_ip" placeholder="Contoh: 192.168.1.100" required>
                        </div>
                        <div>
                            <label for="add-end-ip">End IP:</label>
                            <input type="text" id="add-end-ip" name="end_ip" placeholder="Contoh: 192.168.1.200" required>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Simpan
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="hideAddForm()">
                            <i class="fas fa-times"></i> Batal
                        </button>
                    </div>
                </form>
            </div>

            <!-- Edit Pool Form -->
            <div id="edit-form-container" class="form-container" style="display: none;">
                <div class="form-header">
                    <h3>Edit IP Pool</h3>
                    <button class="close-btn" onclick="hideEditForm()">&times;</button>
                </div>
                <form id="edit-pool-form" method="POST" action="">
                    <input type="hidden" id="edit-id" name="id">
                    <div class="form-group">
                        <div>
                            <label for="edit-name">Nama Pool:</label>
                            <input type="text" id="edit-name" name="name" required>
                        </div>
                        <div>
                            <label for="edit-start-ip">Start IP:</label>
                            <input type="text" id="edit-start-ip" name="start_ip" required>
                        </div>
                        <div>
                            <label for="edit-end-ip">End IP:</label>
                            <input type="text" id="edit-end-ip" name="end_ip" required>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" name="edit_pool" class="btn btn-success">
                            <i class="fas fa-save"></i> Perbarui
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="hideEditForm()">
                            <i class="fas fa-times"></i> Batal
                        </button>
                    </div>
                </form>
            </div>

            <!-- Delete Confirmation Modal -->
            <div id="delete-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Konfirmasi Hapus</h3>
                        <button class="close-btn" onclick="hideDeleteModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Apakah Anda yakin ingin menghapus IP Pool ini?</p>
                        <p><strong id="delete-pool-name"></strong></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-danger" id="confirm-delete-btn">
                            <i class="fas fa-trash"></i> Hapus
                        </button>
                        <button class="btn btn-secondary" onclick="hideDeleteModal()">
                            <i class="fas fa-times"></i> Batal
                        </button>
                    </div>
                </div>
            </div>

            <!-- Pool Table -->
            <div class="pool-table">
                <div class="table-header">
                    <div>Nama Pool</div>
                    <div>Range IP</div>
                    <div>Next Pool</div>
                    <div>Keterangan</div>
                    <div>Aksi</div>
                </div>
                <div class="table-body">
                    <?php if (empty($pools)): ?>
                        <div class="empty-state">
                            <i class="fas fa-layer-group"></i>
                            <p>Belum ada pool yang dikonfigurasi</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($pools as $index => $pool): ?>
                            <?php 
                            // Ambil ID dari database untuk setiap pool
                            $sql_id = "SELECT id FROM ip_pools WHERE name = ? AND start_ip = ? AND end_ip = ?";
                            $stmt_id = $conn->prepare($sql_id);
                            $start_ip = explode('-', $pool['ranges'])[0];
                            $end_ip = explode('-', $pool['ranges'])[1];
                            $stmt_id->bind_param("sss", $pool['name'], $start_ip, $end_ip);
                            $stmt_id->execute();
                            $result_id = $stmt_id->get_result();
                            $pool_data = $result_id->fetch_assoc();
                            $pool_id = $pool_data['id'] ?? ($index + 1);
                            $stmt_id->close();
                            ?>
                            <div class="pool-row" data-id="<?php echo $pool_id; ?>">
                                <div class="pool-name">
                                    <i class="fas fa-layer-group"></i>
                                    <?php echo htmlspecialchars($pool['name']); ?>
                                </div>
                                <div class="pool-range">
                                    <?php echo htmlspecialchars($pool['ranges']); ?>
                                </div>
                                <div class="pool-next <?php echo empty($pool['next_pool']) ? 'empty' : ''; ?>">
                                    <?php echo empty($pool['next_pool']) ? 'Tidak ada' : htmlspecialchars($pool['next_pool']); ?>
                                </div>
                                <div class="pool-comment">
                                    <?php echo htmlspecialchars($pool['comment']); ?>
                                </div>
                                <div class="actions">
                                    <a href="#" class="action-btn btn-edit">
                                        <i class="fas fa-edit"></i> Edit
                                    </a>
                                    <a href="#" class="action-btn btn-delete">
                                        <i class="fas fa-trash"></i> Hapus
                                    </a>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <script src="asset/script.js"></script>
</body>
</html>
