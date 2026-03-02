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
if (isset($_POST['action']) && $_POST['action'] == 'add') {
    $name = cleanInput($_POST['name']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);

    if (!empty($name) && !empty($remote_address) && !empty($speed_limit)) {
        // Ambil data pool berdasarkan ID
        $poolStmt = $conn->prepare("SELECT id, gateway FROM ip_pools WHERE id = ?");
        $poolStmt->bind_param("i", $remote_address);
        $poolStmt->execute();
        $poolStmt->bind_result($pool_id, $gateway);
        
        if ($poolStmt->fetch()) {
            $poolStmt->close();
        } else {
            $poolStmt->close();
            echo json_encode(['success' => false, 'message' => 'Pool tidak ditemukan!']);
            exit();
        }

        if (!validateIP($gateway)) {
            echo json_encode(['success' => false, 'message' => 'Format Local Address tidak valid!']);
            exit();
        } else {
            // Cek apakah nama paket sudah ada
            $checkStmt = $conn->prepare("SELECT id FROM paket_bandwidth WHERE name = ?");
            $checkStmt->bind_param("s", $name);
            $checkStmt->execute();
            $checkStmt->store_result();

            if ($checkStmt->num_rows > 0) {
                echo json_encode(['success' => false, 'message' => 'Nama paket bandwidth sudah ada!']);
                $checkStmt->close();
                exit();
            }
            $checkStmt->close();

            $sql = "INSERT INTO paket_bandwidth (name, id_local_address, id_remote_address, speed_limit) VALUES (?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("siss", $name, $pool_id, $pool_id, $speed_limit);

            if ($stmt->execute()) {
                echo json_encode(['success' => true, 'message' => 'Paket bandwidth berhasil ditambahkan!']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Error: ' . $stmt->error]);
            }
            $stmt->close();
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Semua field harus diisi!']);
    }
    exit();
}
// Handle edit paket
if (isset($_POST['action']) && $_POST['action'] == 'edit') {
    $id = cleanInput($_POST['id']);
    $name = cleanInput($_POST['name']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);

    if (!empty($id) && !empty($name) && !empty($remote_address) && !empty($speed_limit)) {
        // Ambil data pool berdasarkan ID
        $poolStmt = $conn->prepare("SELECT id, gateway FROM ip_pools WHERE id = ?");
        $poolStmt->bind_param("i", $remote_address);
        $poolStmt->execute();
        $poolStmt->bind_result($pool_id, $gateway);
        
        if ($poolStmt->fetch()) {
            $poolStmt->close();
        } else {
            $poolStmt->close();
            echo json_encode(['success' => false, 'message' => 'Pool tidak ditemukan!']);
            exit();
        }

        if (!validateIP($gateway)) {
            echo json_encode(['success' => false, 'message' => 'Format Local Address tidak valid!']);
            exit();
        } else {
            // Cek apakah nama paket sudah ada (kecuali paket yang sedang diedit)
            $checkStmt = $conn->prepare("SELECT id FROM paket_bandwidth WHERE name = ? AND id != ?");
            $checkStmt->bind_param("si", $name, $id);
            $checkStmt->execute();
            $checkStmt->store_result();

            if ($checkStmt->num_rows > 0) {
                echo json_encode(['success' => false, 'message' => 'Nama paket bandwidth sudah ada!']);
                $checkStmt->close();
                exit();
            }
            $checkStmt->close();

            $sql = "UPDATE paket_bandwidth SET name = ?, id_local_address = ?, id_remote_address = ?, speed_limit = ? WHERE id = ?";            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sissi", $name, $pool_id, $pool_id, $speed_limit, $id);

            if ($stmt->execute()) {
                echo json_encode(['success' => true, 'message' => 'Paket bandwidth berhasil diperbarui!']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Error: ' . $stmt->error]);
            }
            $stmt->close();
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Semua field harus diisi!']);
    }
    exit();
}
// Handle hapus paket
if (isset($_GET['action']) && $_GET['action'] == 'delete') {
    $id = cleanInput($_GET['id']);
    $sql = "DELETE FROM paket_bandwidth WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Paket bandwidth berhasil dihapus!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error: ' . $stmt->error]);
    }
    $stmt->close();
    exit();
}

// Ambil data paket untuk refresh
if (isset($_GET['action']) && $_GET['action'] == 'get_pakets') {
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
                'speed_limit' => $row['speed_limit']
            ];
        }
    }
    echo json_encode(['success' => true, 'pakets' => $pakets]);
    exit();
}

// Jika tidak ada action yang valid
echo json_encode(['success' => false, 'message' => 'Aksi tidak valid!']);
?>