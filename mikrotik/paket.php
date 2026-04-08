<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}

// Include file konfigurasi database
require_once '../config.php';

// Handle tambah paket
$message = '';
$message_type = '';
if (isset($_POST['add_paket'])) {
    $name = cleanInput($_POST['name']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    $price = cleanInput($_POST['price']);

    if (!empty($name) && !empty($remote_address) && !empty($speed_limit) && !empty($price)) {
        // Ambil data pool berdasarkan ID
        $poolStmt = $conn->prepare("SELECT id, gateway FROM ip_pools WHERE id = ?");
        $poolStmt->bind_param("i", $remote_address);
        $poolStmt->execute();
        $poolStmt->bind_result($pool_id, $gateway);
        
        if ($poolStmt->fetch()) {
            $poolStmt->close();
        } else {
            $poolStmt->close();
            $message = "Pool tidak ditemukan!";
            $message_type = "error";
        }

        if (!validateIP($gateway)) {
            $message = "Format Local Address tidak valid!";
            $message_type = "error";
        } else {
            // Cek apakah nama paket sudah ada
            $checkStmt = $conn->prepare("SELECT id FROM paket_bandwidth WHERE name = ?");
            $checkStmt->bind_param("s", $name);
            $checkStmt->execute();
            $checkStmt->store_result();

            if ($checkStmt->num_rows > 0) {
                $message = "Nama paket bandwidth sudah ada!";
                $message_type = "error";
            } else {
                $sql = "INSERT INTO paket_bandwidth (name, id_local_address, id_remote_address, speed_limit, price) VALUES (?, ?, ?, ?, ?)";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param("sissi", $name, $pool_id, $pool_id, $speed_limit, $price);

                if ($stmt->execute()) {
                    $message = "Paket bandwidth berhasil ditambahkan!";
                    $message_type = "success";
                    // Redirect untuk refresh halaman dan data
                    header("Location: paket.php");
                    exit();
                } else {
                    $message = "Error: " . $stmt->error;
                    $message_type = "error";
                }
                $stmt->close();
            }
            $checkStmt->close();
        }
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle edit paket
if (isset($_POST['edit_paket'])) {
    $id = cleanInput($_POST['id']);
    $name = cleanInput($_POST['name']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    $price = cleanInput($_POST['price']);

    if (!empty($id) && !empty($name) && !empty($remote_address) && !empty($speed_limit) && !empty($price)) {
        // Ambil data pool berdasarkan ID
        $poolStmt = $conn->prepare("SELECT id, gateway FROM ip_pools WHERE id = ?");
        $poolStmt->bind_param("i", $remote_address);
        $poolStmt->execute();
        $poolStmt->bind_result($pool_id, $gateway);
        
        if ($poolStmt->fetch()) {
            $poolStmt->close();
        } else {
            $poolStmt->close();
            $message = "Pool tidak ditemukan!";
            $message_type = "error";
        }

        if (!validateIP($gateway)) {
            $message = "Format Local Address tidak valid!";
            $message_type = "error";
        } else {
            // Cek apakah nama paket sudah ada (kecuali paket yang sedang diedit)
            $checkStmt = $conn->prepare("SELECT id FROM paket_bandwidth WHERE name = ? AND id != ?");
            $checkStmt->bind_param("si", $name, $id);
            $checkStmt->execute();
            $checkStmt->store_result();

            if ($checkStmt->num_rows > 0) {
                $message = "Nama paket bandwidth sudah ada!";
                $message_type = "error";
            } else {
                $sql = "UPDATE paket_bandwidth SET name = ?, id_local_address = ?, id_remote_address = ?, speed_limit = ?, price = ? WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param("sissii", $name, $pool_id, $pool_id, $speed_limit, $price, $id);

                if ($stmt->execute()) {
                    $message = "Paket bandwidth berhasil diperbarui!";
                    $message_type = "success";
                    // Redirect untuk refresh halaman dan data
                    header("Location: paket.php");
                    exit();
                } else {
                    $message = "Error: " . $stmt->error;
                    $message_type = "error";
                }
                $stmt->close();
            }
            $checkStmt->close();
        }
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle hapus paket
if (isset($_GET['delete'])) {
    $id = cleanInput($_GET['delete']);
    $sql = "DELETE FROM paket_bandwidth WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        $message = "Paket bandwidth berhasil dihapus!";
        $message_type = "success";
        // Redirect untuk refresh halaman dan data
        header("Location: paket.php");
        exit();
    } else {
        $message = "Error: " . $stmt->error;
        $message_type = "error";
    }
    $stmt->close();
}

// Ambil data paket dari database
$sql = "SELECT p.*, ip.name as pool_name, ip.gateway 
        FROM paket_bandwidth p 
        LEFT JOIN ip_pools ip ON p.id_remote_address = ip.id 
        ORDER BY p.name";
$result = $conn->query($sql);
$pakets = [];
if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $pakets[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'local_address' => $row['gateway'],
            'remote_address' => $row['pool_name'],
            'speed_limit' => $row['speed_limit'],
            'price' => $row['price'] ?? 0
        ];
    }
}

// Ambil data IP Pool untuk dropdown
$sql_pools = "SELECT id, name, gateway FROM ip_pools ORDER BY name";
$result_pools = $conn->query($sql_pools);
$ip_pools = [];
if ($result_pools->num_rows > 0) {
    while($row = $result_pools->fetch_assoc()) {
        $ip_pools[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'gateway' => $row['gateway']
        ];
    }
}

// Ambil data paket untuk edit (untuk mengisi dropdown remote address)
$edit_paket = null;
if (isset($_GET['edit_id'])) {
    $edit_id = cleanInput($_GET['edit_id']);
    $sql_edit = "SELECT p.*, ip.name as pool_name, ip.gateway 
                 FROM paket_bandwidth p 
                 LEFT JOIN ip_pools ip ON p.id_remote_address = ip.id 
                 WHERE p.id = ?";
    $stmt_edit = $conn->prepare($sql_edit);
    $stmt_edit->bind_param("i", $edit_id);
    $stmt_edit->execute();
    $result_edit = $stmt_edit->get_result();
    
    if ($result_edit->num_rows > 0) {
        $edit_paket = $result_edit->fetch_assoc();
    }
    $stmt_edit->close();
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paket Bandwidth - Mikrotik Management</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
    <div class="overlay" id="overlay"></div>
    <?php include '../includes/navbar.php'; ?>

    <!-- Main Content Area -->
    <div class="main-content">
        <?php include '../includes/header.php'; ?>

        <div class="content-body">
            <!-- Paket Header -->
            <div class="pool-header">
                <div class="pool-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-gem"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count($pakets); ?></h3>
                            <span>Total Paket</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-download"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pakets, function($p) { return !empty($p['speed_limit']); })); ?></h3>
                            <span>Dengan Limit</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-network-wired"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pakets, function($p) { return !empty($p['local_address']) && !empty($p['remote_address']); })); ?></h3>
                            <span>Dengan Alamat</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-money-bill-wave"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pakets, function($p) { return !empty($p['price']); })); ?></h3>
                            <span>Dengan Harga</span>
                        </div>
                    </div>
                </div>
                <button class="btn btn-add" onclick="showAddForm()">
                    <i class="fas fa-plus"></i> Tambah Paket
                </button>
            </div>

            <!-- Add Paket Form -->
            <div id="add-form-container" class="form-container" style="display: none;">
                <div class="form-header">
                    <h3>Tambah Paket Bandwidth Baru</h3>
                    <button class="close-btn" onclick="hideAddForm()">&times;</button>
                </div>
                <form id="add-paket-form" method="POST" action="">
                    <div class="form-group">
                        <div>
                            <label for="add-name">Nama Paket:</label>
                            <input type="text" id="add-name" name="name" placeholder="Contoh: Paket 10 Mbps" required>
                        </div>
                        <div>
                            <label for="add-local-address">Local Address:</label>
                            <input type="text" id="add-local-address" name="local_address" placeholder="Contoh: 192.168.1.1" required readonly>
                        </div>
                        <div>
                            <label for="add-remote-address">Remote Address:</label>
                            <select id="add-remote-address" name="remote_address" required class="form-control">
                                <option value="">Pilih IP Pool</option>
                                <?php foreach ($ip_pools as $pool): ?>
                                    <option value="<?php echo htmlspecialchars($pool['id']); ?>"
                                            data-gateway="<?php echo htmlspecialchars($pool['gateway']); ?>">
                                        <?php echo htmlspecialchars($pool['name']); ?> (Gateway: <?php echo htmlspecialchars($pool['gateway']); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="add-speed-limit">Speed Limit:</label>
                            <input type="text" id="add-speed-limit" name="speed_limit" placeholder="Contoh: 10M/10M" required>
                        </div>
                        <div>
                            <label for="add-price">Harga (Rp):</label>
                            <input type="number" id="add-price" name="price" placeholder="Contoh: 100000" required>
                        </div>
                    </div>
            <div class="form-actions">
                        <button type="submit" name="add_paket" class="btn btn-primary">
                            <i class="fas fa-save"></i> Simpan
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="hideAddForm()">
                            <i class="fas fa-times"></i> Batal
                        </button>
                    </div>
                </form>
            </div>

            <!-- Edit Paket Form -->
            <div id="edit-form-container" class="form-container" style="display: none;">
                <div class="form-header">
                    <h3>Edit Paket Bandwidth</h3>
                    <button class="close-btn" onclick="hideEditForm()">&times;</button>
                </div>
                <form id="edit-paket-form" method="POST" action="">
                    <input type="hidden" id="edit-id" name="id">
                    <div class="form-group">
                        <div>
                            <label for="edit-name">Nama Paket:</label>
                            <input type="text" id="edit-name" name="name" required>
                        </div>
                        <div>
                            <label for="edit-local-address">Local Address:</label>
                            <input type="text" id="edit-local-address" name="local_address" required readonly>
                        </div>
                        <div>
                            <label for="edit-remote-address">Remote Address:</label>
                            <select id="edit-remote-address" name="remote_address" required class="form-control">
                                <option value="">Pilih IP Pool</option>
                                <?php foreach ($ip_pools as $pool): ?>
                                    <option value="<?php echo htmlspecialchars($pool['id']); ?>"
                                            data-gateway="<?php echo htmlspecialchars($pool['gateway']); ?>">
                                        <?php echo htmlspecialchars($pool['name']); ?> (Gateway: <?php echo htmlspecialchars($pool['gateway']); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="edit-speed-limit">Speed Limit:</label>
                            <input type="text" id="edit-speed-limit" name="speed_limit" required>
                        </div>
                        <div>
                            <label for="edit-price">Harga (Rp):</label>
                            <input type="number" id="edit-price" name="price" required>
                        </div>
                    </div>
            <div class="form-actions">
                        <button type="submit" name="edit_paket" class="btn btn-success">
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
                        <p>Apakah Anda yakin ingin menghapus paket bandwidth ini?</p>
                        <p><strong id="delete-paket-name"></strong></p>
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

            <!-- Message Display -->
            <?php if (!empty($message)): ?>
                <div class="message <?php echo $message_type; ?>">
                    <i class="fas fa-<?php echo $message_type == 'success' ? 'check-circle' : 'exclamation-circle'; ?>"></i>
                    <?php echo $message; ?>
                </div>
            <?php endif; ?>

            <!-- Paket Table -->
            <div class="pool-table">
                <div class="table-header">
                    <div>Nama Paket</div>
                    <div>Local Address</div>
                    <div>Remote Address</div>
                    <div>Speed Limit</div>
                    <div>Harga</div>
                    <div>Aksi</div>
                </div>
                <div class="table-body">
                    <?php if (empty($pakets)): ?>
                        <div class="empty-state">
                            <i class="fas fa-gem"></i>
                            <p>Belum ada paket bandwidth yang dikonfigurasi</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($pakets as $paket): ?>
                            <div class="pool-row" data-id="<?php echo $paket['id']; ?>" data-remote-id="<?php echo $paket['id']; ?>">
                                <div class="pool-name">
                                    <i class="fas fa-gem"></i>
                                    <?php echo htmlspecialchars($paket['name']); ?>
                                </div>
                                <div class="pool-range">
                                    <?php echo htmlspecialchars($paket['local_address']); ?>
                                </div>
                                <div class="pool-next">
                                    <?php
                                    // Cek apakah remote_address adalah nama pool atau IP
                                    if (validateIP($paket['remote_address'])) {
                                        // Jika IP, cari nama pool yang sesuai
                                        $poolStmt = $conn->prepare("SELECT name FROM ip_pools WHERE start_ip = ? OR end_ip = ? OR name = ? LIMIT 1");
                                        if ($poolStmt) {
                                            $poolStmt->bind_param("sss", $paket['remote_address'], $paket['remote_address'], $paket['remote_address']);
                                            $poolStmt->execute();
                                            $poolStmt->bind_result($pool_name);
                                            if ($poolStmt->fetch()) {
                                                echo htmlspecialchars($pool_name);
                                            } else {
                                                echo htmlspecialchars($paket['remote_address']);
                                            }
                                            $poolStmt->close();
                                        } else {
                                            echo htmlspecialchars($paket['remote_address']);
                                        }
                                    } else {
                                        // Jika bukan IP, tampilkan langsung (sudah nama pool)
                                        echo htmlspecialchars($paket['remote_address']);
                                    }
                                    ?>
                                </div>
                                <div class="pool-comment">
                                    <?php echo htmlspecialchars($paket['speed_limit']); ?>
                                </div>
                                <div class="pool-price">
                                    <?php echo 'Rp ' . number_format($paket['price'], 0, ',', '.'); ?>
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

    <script src="../assets/js/mikrotik.js"></script>

    <!-- Tambahkan fungsi validasi -->
            <script>
    // Validasi form tambah
    document.getElementById('add-paket-form').addEventListener('submit', function(e) {
        const name = document.getElementById('add-name').value.trim();
        const localAddress = document.getElementById('add-local-address').value.trim();
        const remoteAddress = document.getElementById('add-remote-address').value.trim();
        const speedLimit = document.getElementById('add-speed-limit').value.trim();
        const price = document.getElementById('add-price').value.trim();

        if (!name || !localAddress || !remoteAddress || !speedLimit || !price) {
            e.preventDefault();
            alert('Semua field harus diisi!');
            return false;
        }

        // Validasi format IP hanya untuk local_address
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(localAddress)) {
            e.preventDefault();
            alert('Format Local Address tidak valid!');
            return false;
        }

        // Validasi harga harus lebih dari 0
        if (parseInt(price) <= 0) {
            e.preventDefault();
            alert('Harga harus lebih dari 0!');
            return false;
        }

        return true;
    });

    // Validasi form edit
    document.getElementById('edit-paket-form').addEventListener('submit', function(e) {
        const name = document.getElementById('edit-name').value.trim();
        const localAddress = document.getElementById('edit-local-address').value.trim();
        const remoteAddress = document.getElementById('edit-remote-address').value.trim();
        const speedLimit = document.getElementById('edit-speed-limit').value.trim();
        const price = document.getElementById('edit-price').value.trim();

        if (!name || !localAddress || !remoteAddress || !speedLimit || !price) {
            e.preventDefault();
            alert('Semua field harus diisi!');
            return false;
        }

        // Validasi format IP hanya untuk local_address
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(localAddress)) {
            e.preventDefault();
            alert('Format Local Address tidak valid!');
            return false;
        }

        // Validasi harga harus lebih dari 0
        if (parseInt(price) <= 0) {
            e.preventDefault();
            alert('Harga harus lebih dari 0!');
            return false;
        }

        return true;
    });
    </script>
</body>
</html>