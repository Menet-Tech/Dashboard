<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// Include file konfigurasi database
require_once 'config.php';

// Handle tambah pelanggan
$message = '';
$message_type = '';
if (isset($_POST['add_pelanggan'])) {
    $nama = cleanInput($_POST['nama']);
    $user_pppoe = cleanInput($_POST['user_pppoe']);
    $password_pppoe = cleanInput($_POST['password_pppoe']);
    $paket_id = cleanInput($_POST['paket_id']);
    $jatuh_tempo = cleanInput($_POST['jatuh_tempo']);
    $status = cleanInput($_POST['status']);

    if (!empty($nama) && !empty($user_pppoe) && !empty($paket_id) && !empty($jatuh_tempo) && !empty($status)) {
        // Jika password kosong, gunakan format "user PPPoE122"
        if (empty($password_pppoe)) {
            $password_pppoe = $user_pppoe . "122";
        }

        // Cek apakah user PPPoE sudah ada
        $checkStmt = $conn->prepare("SELECT id FROM pelanggan WHERE user_pppoe = ?");
        $checkStmt->bind_param("s", $user_pppoe);
        $checkStmt->execute();
        $checkStmt->store_result();

        if ($checkStmt->num_rows > 0) {
            $message = "User PPPoE sudah ada!";
            $message_type = "error";
        } else {
            // Ambil harga paket dari database
            $paketStmt = $conn->prepare("SELECT price FROM paket_bandwidth WHERE id = ?");
            $paketStmt->bind_param("i", $paket_id);
            $paketStmt->execute();
            $paketStmt->bind_result($price);
            $paketStmt->fetch();
            $paketStmt->close();

            $sql = "INSERT INTO pelanggan (nama, user_pppoe, password_pppoe, paket_id, jatuh_tempo, harga, status) VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sssiiis", $nama, $user_pppoe, $password_pppoe, $paket_id, $jatuh_tempo, $price, $status);

            if ($stmt->execute()) {
                $message = "Pelanggan berhasil ditambahkan!";
                $message_type = "success";
                // Redirect untuk refresh halaman dan data
                header("Location: pelanggan.php");
                exit();
            } else {
                $message = "Error: " . $stmt->error;
                $message_type = "error";
            }
            $stmt->close();
        }
        $checkStmt->close();
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle edit pelanggan
if (isset($_POST['edit_pelanggan'])) {
    $id = cleanInput($_POST['id']);
    $nama = cleanInput($_POST['nama']);
    $user_pppoe = cleanInput($_POST['user_pppoe']);
    $password_pppoe = cleanInput($_POST['password_pppoe']);
    $paket_id = cleanInput($_POST['paket_id']);
    $jatuh_tempo = cleanInput($_POST['jatuh_tempo']);
    $status = cleanInput($_POST['status']);

    if (!empty($id) && !empty($nama) && !empty($user_pppoe) && !empty($paket_id) && !empty($jatuh_tempo) && !empty($status)) {
        // Jika password kosong, gunakan format "user PPPoE122"
        if (empty($password_pppoe)) {
            $password_pppoe = $user_pppoe . "122";
        }

        // Cek apakah user PPPoE sudah ada (kecuali pelanggan yang sedang diedit)
        $checkStmt = $conn->prepare("SELECT id FROM pelanggan WHERE user_pppoe = ? AND id != ?");
        $checkStmt->bind_param("si", $user_pppoe, $id);
        $checkStmt->execute();
        $checkStmt->store_result();

        if ($checkStmt->num_rows > 0) {
            $message = "User PPPoE sudah ada!";
            $message_type = "error";
        } else {
            // Ambil harga paket dari database
            $paketStmt = $conn->prepare("SELECT price FROM paket_bandwidth WHERE id = ?");
            $paketStmt->bind_param("i", $paket_id);
            $paketStmt->execute();
            $paketStmt->bind_result($price);
            $paketStmt->fetch();
            $paketStmt->close();

            $sql = "UPDATE pelanggan SET nama = ?, user_pppoe = ?, password_pppoe = ?, paket_id = ?, jatuh_tempo = ?, harga = ?, status = ? WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sssiissi", $nama, $user_pppoe, $password_pppoe, $paket_id, $jatuh_tempo, $price, $status, $id);

            if ($stmt->execute()) {
                $message = "Pelanggan berhasil diperbarui!";
                $message_type = "success";
                // Redirect untuk refresh halaman dan data
                header("Location: pelanggan.php");
                exit();
            } else {
                $message = "Error: " . $stmt->error;
                $message_type = "error";
            }
            $stmt->close();
        }
        $checkStmt->close();
    } else {
        $message = "Semua field harus diisi!";
        $message_type = "error";
    }
}

// Handle hapus pelanggan
if (isset($_GET['delete'])) {
    $id = cleanInput($_GET['delete']);
    $sql = "DELETE FROM pelanggan WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        $message = "Pelanggan berhasil dihapus!";
        $message_type = "success";
        // Redirect untuk refresh halaman dan data
        header("Location: pelanggan.php");
        exit();
    } else {
        $message = "Error: " . $stmt->error;
        $message_type = "error";
    }
    $stmt->close();
}

// Ambil data pelanggan dari database
$sql = "SELECT p.*, pb.name as paket_name, pb.price 
        FROM pelanggan p 
        LEFT JOIN paket_bandwidth pb ON p.paket_id = pb.id 
        ORDER BY p.nama";
$result = $conn->query($sql);
$pelanggans = [];
if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $pelanggans[] = [
            'id' => $row['id'],
            'nama' => $row['nama'],
            'user_pppoe' => $row['user_pppoe'],
            'password_pppoe' => $row['password_pppoe'],
            'paket_name' => $row['paket_name'],
            'jatuh_tempo' => $row['jatuh_tempo'],
            'harga' => $row['price'] ?? 0,
            'status' => $row['status'] ?? 'active'
        ];
    }
}

// Ambil data paket untuk dropdown
$sql_pakets = "SELECT id, name, price FROM paket_bandwidth ORDER BY name";
$result_pakets = $conn->query($sql_pakets);
$pakets = [];
if ($result_pakets->num_rows > 0) {
    while($row = $result_pakets->fetch_assoc()) {
        $pakets[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'price' => $row['price']
        ];
    }
}

// Ambil data pelanggan untuk edit
$edit_pelanggan = null;
if (isset($_GET['edit_id'])) {
    $edit_id = cleanInput($_GET['edit_id']);
    $sql_edit = "SELECT p.*, pb.name as paket_name, pb.price 
                 FROM pelanggan p 
                 LEFT JOIN paket_bandwidth pb ON p.paket_id = pb.id 
                 WHERE p.id = ?";
    $stmt_edit = $conn->prepare($sql_edit);
    $stmt_edit->bind_param("i", $edit_id);
    $stmt_edit->execute();
    $result_edit = $stmt_edit->get_result();
    
    if ($result_edit->num_rows > 0) {
        $edit_pelanggan = $result_edit->fetch_assoc();
    }
    $stmt_edit->close();
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pelanggan - Mikrotik Management</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <!-- Overlay removed to prevent blocking clicks -->
    <?php include 'navbar.php'; ?>

    <!-- Main Content Area -->
    <div class="main-content">
        <?php include 'header.php'; ?>

        <div class="content-body">
            <!-- Pelanggan Header -->
            <div class="pool-header">
                <div class="pool-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count($pelanggans); ?></h3>
                            <span>Total Pelanggan</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-gem"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pelanggans, function($p) { return !empty($p['paket_name']); })); ?></h3>
                            <span>Dengan Paket</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pelanggans, function($p) { return !empty($p['jatuh_tempo']); })); ?></h3>
                            <span>Dengan Jatuh Tempo</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-money-bill-wave"></i>
                        </div>
                        <div class="stat-info">
                            <h3><?php echo count(array_filter($pelanggans, function($p) { return !empty($p['harga']); })); ?></h3>
                            <span>Dengan Harga</span>
                        </div>
                    </div>
                </div>
                <button class="btn btn-add" onclick="showAddForm()">
                    <i class="fas fa-plus"></i> Tambah Pelanggan
                </button>
            </div>

            <!-- Add Pelanggan Form -->
            <div id="add-form-container" class="form-container" style="display: none; z-index: 100;">
                <div class="form-header">
                    <h3>Tambah Pelanggan Baru</h3>
                    <button class="close-btn" onclick="hideAddForm()">&times;</button>
                </div>
                <form id="add-pelanggan-form" method="POST" action="">
                    <div class="form-group">
                        <div>
                            <label for="add-nama">Nama:</label>
                            <input type="text" id="add-nama" name="nama" placeholder="Contoh: John Doe" required>
                        </div>
                        <div>
                            <label for="add-user-pppoe">User PPPoE:</label>
                            <input type="text" id="add-user-pppoe" name="user_pppoe" placeholder="Contoh: johndoe" required>
                        </div>
                        <div>
                            <label for="add-password-pppoe">Password PPPoE:</label>
                            <input type="password" id="add-password-pppoe" name="password_pppoe" placeholder="Kosongkan untuk menggunakan format otomatis">
                        </div>
                        <div>
                            <label for="add-paket-id">Paket:</label>
                            <select id="add-paket-id" name="paket_id" required class="form-control">
                                <option value="">Pilih Paket</option>
                                <?php foreach ($pakets as $paket): ?>
                                    <option value="<?php echo htmlspecialchars($paket['id']); ?>">
                                        <?php echo htmlspecialchars($paket['name']); ?> (Rp <?php echo number_format($paket['price'], 0, ',', '.'); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="add-jatuh-tempo">Jatuh Tempo (Tanggal):</label>
                            <input type="number" id="add-jatuh-tempo" name="jatuh_tempo" placeholder="Contoh: 15" min="1" max="31" required>
                        </div>
                        <div>
                            <label for="add-status">Status:</label>
                            <select id="add-status" name="status" required class="form-control">
                                <option value="">Pilih Status</option>
                                <option value="active">Active</option>
                                <option value="limit">Limit</option>
                                <option value="tertunda">Tertunda</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" name="add_pelanggan" class="btn btn-primary">
                            <i class="fas fa-save"></i> Simpan
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="hideAddForm()">
                            <i class="fas fa-times"></i> Batal
                        </button>
                    </div>
                </form>
            </div>

            <!-- Edit Pelanggan Form -->
            <div id="edit-form-container" class="form-container" style="display: none; z-index: 100;">
                <div class="form-header">
                    <h3>Edit Pelanggan</h3>
                    <button class="close-btn" onclick="hideEditForm()">&times;</button>
                </div>
                <form id="edit-pelanggan-form" method="POST" action="">
                    <input type="hidden" id="edit-id" name="id">
                    <div class="form-group">
                        <div>
                            <label for="edit-nama">Nama:</label>
                            <input type="text" id="edit-nama" name="nama" required>
                        </div>
                        <div>
                            <label for="edit-user-pppoe">User PPPoE:</label>
                            <input type="text" id="edit-user-pppoe" name="user_pppoe" required>
                        </div>
                        <div>
                            <label for="edit-password-pppoe">Password PPPoE:</label>
                            <input type="password" id="edit-password-pppoe" name="password_pppoe">
                        </div>
                        <div>
                            <label for="edit-paket-id">Paket:</label>
                            <select id="edit-paket-id" name="paket_id" required class="form-control">
                                <option value="">Pilih Paket</option>
                                <?php foreach ($pakets as $paket): ?>
                                    <option value="<?php echo htmlspecialchars($paket['id']); ?>">
                                        <?php echo htmlspecialchars($paket['name']); ?> (Rp <?php echo number_format($paket['price'], 0, ',', '.'); ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label for="edit-jatuh-tempo">Jatuh Tempo (Tanggal):</label>
                            <input type="number" id="edit-jatuh-tempo" name="jatuh_tempo" min="1" max="31" required>
                        </div>
                        <div>
                            <label for="edit-status">Status:</label>
                            <select id="edit-status" name="status" required class="form-control">
                                <option value="">Pilih Status</option>
                                <option value="active">Active</option>
                                <option value="limit">Limit</option>
                                <option value="tertunda">Tertunda</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" name="edit_pelanggan" class="btn btn-success">
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
                        <p>Apakah Anda yakin ingin menghapus pelanggan ini?</p>
                        <p><strong id="delete-pelanggan-name"></strong></p>
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

            <!-- Pelanggan Table -->
            <div class="pool-table">
                <div class="table-header">
                    <div>Nama</div>
                    <div>User PPPoE</div>
                    <div>Password PPPoE</div>
                    <div>Paket</div>
                    <div>Jatuh Tempo</div>
                    <div>Status</div>
                    <div>Harga</div>
                    <div>Aksi</div>
                </div>
                <div class="table-body">
                    <?php if (empty($pelanggans)): ?>
                        <div class="empty-state">
                            <i class="fas fa-users"></i>
                            <p>Belum ada pelanggan yang dikonfigurasi</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($pelanggans as $pelanggan): ?>
                            <div class="pool-row" data-id="<?php echo $pelanggan['id']; ?>" data-status="<?php echo $pelanggan['status']; ?>">
                                <div class="pool-name">
                                    <i class="fas fa-user"></i>
                                    <?php echo htmlspecialchars($pelanggan['nama']); ?>
                                </div>
                                <div class="pool-range">
                                    <?php echo htmlspecialchars($pelanggan['user_pppoe']); ?>
                                </div>
                                <div class="pool-next">
                                    <?php echo htmlspecialchars($pelanggan['password_pppoe']); ?>
                                </div>
                                <div class="pool-comment">
                                    <?php echo htmlspecialchars($pelanggan['paket_name']); ?>
                                </div>
                                <div class="pool-price">
                                    Tanggal <?php echo htmlspecialchars($pelanggan['jatuh_tempo']); ?>
                                </div>
                                <div class="pool-status">
                                    <?php 
                                    $status = $pelanggan['status'];
                                    $status_class = '';
                                    $status_icon = '';
                                    
                                    switch($status) {
                                        case 'active':
                                            $status_class = 'status-active';
                                            $status_icon = 'fas fa-check-circle';
                                            break;
                                        case 'limit':
                                            $status_class = 'status-limit';
                                            $status_icon = 'fas fa-exclamation-triangle';
                                            break;
                                        case 'tertunda':
                                            $status_class = 'status-tertunda';
                                            $status_icon = 'fas fa-pause-circle';
                                            break;
                                        case 'inactive':
                                            $status_class = 'status-inactive';
                                            $status_icon = 'fas fa-times-circle';
                                            break;
                                        default:
                                            $status_class = 'status-active';
                                            $status_icon = 'fas fa-check-circle';
                                            break;
                                    }
                                    ?>
                                    <span class="status-badge <?php echo $status_class; ?>">
                                        <i class="<?php echo $status_icon; ?>"></i>
                                        <?php echo ucfirst($status); ?>
                                    </span>
                                </div>
                                <div class="pool-price">
                                    <?php echo 'Rp ' . number_format($pelanggan['harga'], 0, ',', '.'); ?>
                                </div>
            <div class="actions">
                <a href="#" class="action-btn btn-edit">
                    <i class="fas fa-edit"></i> Edit
                </a>
                <a href="#" class="action-btn btn-delete">
                    <i class="fas fa-trash"></i> Hapus
                </a>
                <a href="tagihan.php" class="action-btn btn-generate">
                    <i class="fas fa-file-invoice"></i> Lihat Tagihan
                </a>
            </div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Form validation
        document.getElementById('add-pelanggan-form').addEventListener('submit', function(e) {
            const nama = document.getElementById('add-nama').value.trim();
            const user_pppoe = document.getElementById('add-user-pppoe').value.trim();
            const paket_id = document.getElementById('add-paket-id').value.trim();
            const jatuh_tempo = document.getElementById('add-jatuh-tempo').value.trim();

            if (!nama || !user_pppoe || !paket_id || !jatuh_tempo) {
                e.preventDefault();
                alert('Semua field harus diisi!');
                return false;
            }

            // Validasi jatuh tempo harus antara 1-31
            const jatuhTempoInt = parseInt(jatuh_tempo);
            if (jatuhTempoInt < 1 || jatuhTempoInt > 31) {
                e.preventDefault();
                alert('Jatuh tempo harus antara 1-31!');
                return false;
            }

            return true;
        });

        document.getElementById('edit-pelanggan-form').addEventListener('submit', function(e) {
            const nama = document.getElementById('edit-nama').value.trim();
            const user_pppoe = document.getElementById('edit-user-pppoe').value.trim();
            const paket_id = document.getElementById('edit-paket-id').value.trim();
            const jatuh_tempo = document.getElementById('edit-jatuh-tempo').value.trim();

            if (!nama || !user_pppoe || !paket_id || !jatuh_tempo) {
                e.preventDefault();
                alert('Semua field harus diisi!');
                return false;
            }

            // Validasi jatuh tempo harus antara 1-31
            const jatuhTempoInt = parseInt(jatuh_tempo);
            if (jatuhTempoInt < 1 || jatuhTempoInt > 31) {
                e.preventDefault();
                alert('Jatuh tempo harus antara 1-31!');
                return false;
            }

            return true;
        });

        // Modal functions
        function showAddForm() {
            document.getElementById('add-form-container').style.display = 'block';
        }

        function hideAddForm() {
            document.getElementById('add-form-container').style.display = 'none';
        }

        function showEditForm(id, nama, user_pppoe, password_pppoe, paket_id, jatuh_tempo, status) {
            document.getElementById('edit-id').value = id;
            document.getElementById('edit-nama').value = nama;
            document.getElementById('edit-user-pppoe').value = user_pppoe;
            document.getElementById('edit-password-pppoe').value = password_pppoe;
            document.getElementById('edit-paket-id').value = paket_id;
            document.getElementById('edit-jatuh-tempo').value = jatuh_tempo;
            
            // Pastikan status sesuai dengan ENUM database (case sensitive)
            const validStatus = ['active', 'limit', 'tertunda', 'inactive'];
            let selectedStatus = 'active'; // default
            
            // Konversi ke lowercase dan cek apakah valid
            const lowerStatus = status ? status.toLowerCase() : '';
            if (validStatus.includes(lowerStatus)) {
                selectedStatus = lowerStatus;
            }
            
            document.getElementById('edit-status').value = selectedStatus;
            
            // Debug: Tampilkan status yang akan diset
            console.log('Status yang akan diset ke dropdown:', selectedStatus);
            
            document.getElementById('edit-form-container').style.display = 'block';
        }

        function hideEditForm() {
            document.getElementById('edit-form-container').style.display = 'none';
        }

        function showDeleteModal(id, nama) {
            document.getElementById('delete-pelanggan-name').textContent = nama;
            document.getElementById('delete-modal').style.display = 'block';
            
            // Set up the delete button action
            const confirmBtn = document.getElementById('confirm-delete-btn');
            confirmBtn.onclick = function() {
                window.location.href = 'pelanggan.php?delete=' + id;
            };
        }

        function hideDeleteModal() {
            document.getElementById('delete-modal').style.display = 'none';
        }

        // Edit button click handler
        document.querySelectorAll('.btn-edit').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const row = this.closest('.pool-row');
                const id = row.dataset.id;
                const nama = row.querySelector('.pool-name').textContent.replace('👤 ', '').trim();
                const user_pppoe = row.querySelector('.pool-range').textContent.trim();
                const password_pppoe = row.querySelector('.pool-next').textContent.trim();
                const paket = row.querySelector('.pool-comment').textContent.trim();
                const jatuh_tempo = row.querySelector('.pool-price').textContent.replace('Tanggal ', '').trim();
                
                // Ambil status dari data attribute atau dari badge
                let status = row.dataset.status;
                if (!status) {
                    status = row.querySelector('.pool-status .status-badge').textContent.trim().toLowerCase();
                }
                
                // Debug: Tampilkan status yang diambil
                console.log('Status yang diambil:', status);
                console.log('Data status:', row.dataset.status);
                console.log('Badge text:', row.querySelector('.pool-status .status-badge').textContent.trim().toLowerCase());
                
                // Cari ID paket berdasarkan nama
                let paket_id = '';
                <?php foreach ($pakets as $paket): ?>
                    if ('<?php echo addslashes($paket['name']); ?>' === paket) {
                        paket_id = '<?php echo $paket['id']; ?>';
                    }
                <?php endforeach; ?>
                
                showEditForm(id, nama, user_pppoe, password_pppoe, paket_id, jatuh_tempo, status);
            });
        });

        // Delete button click handler
        document.querySelectorAll('.btn-delete').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const row = this.closest('.pool-row');
                const id = row.dataset.id;
                const nama = row.querySelector('.pool-name').textContent.replace('👤 ', '').trim();
                showDeleteModal(id, nama);
            });
        });
    </script>
</body>
</html>