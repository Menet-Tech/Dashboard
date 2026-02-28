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
    $local_address = cleanInput($_POST['local_address']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    
    if (!empty($name) && !empty($local_address) && !empty($remote_address) && !empty($speed_limit)) {
        // Validasi format IP hanya untuk local_address
        if (!validateIP($local_address)) {
            echo json_encode(['success' => false, 'message' => 'Format Local Address tidak valid!']);
            exit();
        } else {
            $sql = "INSERT INTO paket_bandwidth (name, local_address, remote_address, speed_limit) VALUES (?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssss", $name, $local_address, $remote_address, $speed_limit);
            
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
    $local_address = cleanInput($_POST['local_address']);
    $remote_address = cleanInput($_POST['remote_address']);
    $speed_limit = cleanInput($_POST['speed_limit']);
    
    if (!empty($id) && !empty($name) && !empty($local_address) && !empty($remote_address) && !empty($speed_limit)) {
        // Validasi format IP hanya untuk local_address
        if (!validateIP($local_address)) {
            echo json_encode(['success' => false, 'message' => 'Format Local Address tidak valid!']);
            exit();
        } else {
            $sql = "UPDATE paket_bandwidth SET name = ?, local_address = ?, remote_address = ?, speed_limit = ? WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssssi", $name, $local_address, $remote_address, $speed_limit, $id);
            
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
    echo json_encode(['success' => true, 'pakets' => $pakets]);
    exit();
}

// Jika tidak ada action yang valid
echo json_encode(['success' => false, 'message' => 'Aksi tidak valid!']);
?>