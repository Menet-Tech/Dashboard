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
    $local_address = cleanInput($_POST['local_address']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    
    if (!empty($name) && !empty($local_address) && !empty($remote_address) && !empty($speed_limit)) {
        // Validasi format IP hanya untuk local_address
        if (!validateIP($local_address)) {
            $message = "Format Local Address tidak valid!";
            $message_type = "error";
        } else {
            // Pastikan remote_address berformat IP. Jika user memilih nama pool,
            // coba ambil start_ip dari tabel ip_pools.
            if (!validateIP($remote_address)) {
                $poolStmt = $conn->prepare("SELECT start_ip FROM ip_pools WHERE name = ? LIMIT 1");
                if ($poolStmt) {
                    $poolStmt->bind_param("s", $remote_address);
                    $poolStmt->execute();
                    $poolStmt->bind_result($start_ip);
                    if ($poolStmt->fetch()) {
                        $remote_address = $start_ip;
                    }
                    $poolStmt->close();
                }
            }

            if (!validateIP($remote_address)) {
                $message = "Format Remote Address tidak valid!";
                $message_type = "error";
            } else {
                $sql = "INSERT INTO paket_bandwidth (name, local_address, remote_address, speed_limit) VALUES (?, ?, ?, ?)";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param("ssss", $name, $local_address, $remote_address, $speed_limit);

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
    $local_address = cleanInput($_POST['local_address']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    
    if (!empty($id) && !empty($name) && !empty($local_address) && !empty($remote_address) && !empty($speed_limit)) {
        // Validasi format IP hanya untuk local_address
        if (!validateIP($local_address)) {
            $message = "Format Local Address tidak valid!";
            $message_type = "error";
        } else {
            // Pastikan remote_address berformat IP. Jika user memilih nama pool,
            // coba ambil start_ip dari tabel ip_pools.
            if (!validateIP($remote_address)) {
                $poolStmt = $conn->prepare("SELECT start_ip FROM ip_pools WHERE name = ? LIMIT 1");
                if ($poolStmt) {
                    $poolStmt->bind_param("s", $remote_address);
                    $poolStmt->execute();
                    $poolStmt->bind_result($start_ip);
                    if ($poolStmt->fetch()) {
                        $remote_address = $start_ip;
                    }
                    $poolStmt->close();
                }
            }

            if (!validateIP($remote_address)) {
                $message = "Format Remote Address tidak valid!";
                $message_type = "error";
            } else {
                $sql = "UPDATE paket_bandwidth SET name = ?, local_address = ?, remote_address = ?, speed_limit = ? WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param("ssssi", $name, $local_address, $remote_address, $speed_limit, $id);

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
        $message_type = "success";/*  */
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
$sql = "SELECT * FROM paket_bandwidth ORDER BY name";
$result = $conn->query($sql);
$pakets = [];
if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $pakets[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'local_address' => $row['local_address'],
            'remote_address' => $row['remote_address'],
            'speed_limit' => $row['speed_limit']
        ];
    }
}

// Ambil data IP Pool untuk dropdown
$sql_pools = "SELECT name, start_ip, end_ip FROM ip_pools ORDER BY name";
$result_pools = $conn->query($sql_pools);
$ip_pools = [];
if ($result_pools->num_rows > 0) {
    while($row = $result_pools->fetch_assoc()) {
        $ip_pools[] = [
            'name' => $row['name'],
            'start_ip' => $row['start_ip'],
            'end_ip' => $row['end_ip']
        ];
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paket Bandwidth - Mikrotik Management</title>
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
                            <input type="text" id="add-local-address" name="local_address" placeholder="Contoh: 192.168.1.1" required>
                        </div>
                        <div>
                            <label for="add-remote-address">Remote Address:</label>
                            <select id="add-remote-address" name="remote_address" required class="form-control">
                                <option value="">Pilih IP Pool</option>
                                <?php foreach ($ip_pools as $pool): ?>
                                    <option value="<?php echo htmlspecialchars($pool['name']); ?>" 
                                            data-start-ip="<?php echo htmlspecialchars($pool['start_ip']); ?>"
                                            data-end-ip="<?php echo htmlspecialchars($pool['end_ip']); ?>">
                                        <?php echo htmlspecialchars($pool['name']); ?> (<?php echo htmlspecialchars($pool['start_ip']); ?> - <?php echo htmlspecialchars($pool['end_ip']); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="add-speed-limit">Speed Limit:</label>
                            <input type="text" id="add-speed-limit" name="speed_limit" placeholder="Contoh: 10M/10M" required>
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
                            <input type="text" id="edit-local-address" name="local_address" required>
                        </div>
                        <div>
                            <label for="edit-remote-address">Remote Address:</label>
                            <select id="edit-remote-address" name="remote_address" required class="form-control">
                                <option value="">Pilih IP Pool</option>
                                <?php foreach ($ip_pools as $pool): ?>
                                    <option value="<?php echo htmlspecialchars($pool['name']); ?>" 
                                            data-start-ip="<?php echo htmlspecialchars($pool['start_ip']); ?>"
                                            data-end-ip="<?php echo htmlspecialchars($pool['end_ip']); ?>">
                                        <?php echo htmlspecialchars($pool['name']); ?> (<?php echo htmlspecialchars($pool['start_ip']); ?> - <?php echo htmlspecialchars($pool['end_ip']); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="edit-speed-limit">Speed Limit:</label>
                            <input type="text" id="edit-speed-limit" name="speed_limit" required>
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
                            <div class="pool-row" data-id="<?php echo $paket['id']; ?>">
                                <div class="pool-name">
                                    <i class="fas fa-gem"></i>
                                    <?php echo htmlspecialchars($paket['name']); ?>
                                </div>
                                <div class="pool-range">
                                    <?php echo htmlspecialchars($paket['local_address']); ?>
                                </div>
                                <div class="pool-next">
                                    <?php echo htmlspecialchars($paket['remote_address']); ?>
                                </div>
                                <div class="pool-comment">
                                    <?php echo htmlspecialchars($paket['speed_limit']); ?>
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
    
    <!-- Tambahkan fungsi validasi -->
    <script>
    // Validasi form tambah
    document.getElementById('add-paket-form').addEventListener('submit', function(e) {
        const name = document.getElementById('add-name').value.trim();
        const localAddress = document.getElementById('add-local-address').value.trim();
        const remoteAddress = document.getElementById('add-remote-address').value.trim();
        const speedLimit = document.getElementById('add-speed-limit').value.trim();
        
        if (!name || !localAddress || !remoteAddress || !speedLimit) {
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
        
        return true;
    });
    
    // Validasi form edit
    document.getElementById('edit-paket-form').addEventListener('submit', function(e) {
        const name = document.getElementById('edit-name').value.trim();
        const localAddress = document.getElementById('edit-local-address').value.trim();
        const remoteAddress = document.getElementById('edit-remote-address').value.trim();
        const speedLimit = document.getElementById('edit-speed-limit').value.trim();
        
        if (!name || !localAddress || !remoteAddress || !speedLimit) {
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
        
        return true;
    });
    </script>
</body>
</html>
