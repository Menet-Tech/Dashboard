<?php
session_start();

// Cek apakah user sudah login
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit();
}

// Set header untuk JSON response
header('Content-Type: application/json');

// Include file konfigurasi database
require_once '../config.php';

// Handle tambah IP Pool
if (isset($_POST['action']) && $_POST['action'] == 'add') {
    $name = cleanInput($_POST['name']);
    $start_ip = cleanInput($_POST['start_ip']);
    $end_ip = cleanInput($_POST['end_ip']);
    $gateway = cleanInput($_POST['gateway']);

    if (!empty($name) && !empty($start_ip) && !empty($end_ip) && !empty($gateway)) {
        // Validasi format IP
        if (!validateIP($start_ip) || !validateIP($end_ip) || !validateIP($gateway)) {
            echo json_encode(['success' => false, 'message' => 'Format IP address tidak valid!']);
            exit();
        } elseif (!validateIPRange($start_ip, $end_ip)) {
            echo json_encode(['success' => false, 'message' => 'Start IP harus lebih kecil dari End IP!']);
            exit();
        } else {
                // Cek apakah pool dengan nama yang sama sudah ada
                $cek_sql = "SELECT id FROM ip_pools WHERE name = ?";
                $cek_stmt = $conn->prepare($cek_sql);
                $cek_stmt->bind_param("s", $name);
                $cek_stmt->execute();
                $cek_stmt->store_result();
                if ($cek_stmt->num_rows > 0) {
                    echo json_encode(['success' => false, 'message' => 'Pool dengan nama tersebut sudah ada!']);
                    $cek_stmt->close();
                    exit();
                }
                $cek_stmt->close();
            $sql = "INSERT INTO ip_pools (name, start_ip, end_ip, gateway) VALUES (?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssss", $name, $start_ip, $end_ip, $gateway);
            
            if ($stmt->execute()) {
                echo json_encode(['success' => true, 'message' => 'IP Pool berhasil ditambahkan!']);
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

// Handle edit IP Pool
if (isset($_POST['action']) && $_POST['action'] == 'edit') {
    $id = cleanInput($_POST['id']);
    $name = cleanInput($_POST['name']);
    $start_ip = cleanInput($_POST['start_ip']);
    $end_ip = cleanInput($_POST['end_ip']);
    $gateway = cleanInput($_POST['gateway']);

    if (!empty($id) && !empty($name) && !empty($start_ip) && !empty($end_ip) && !empty($gateway)) {
        // Validasi format IP
        if (!validateIP($start_ip) || !validateIP($end_ip) || !validateIP($gateway)) {
            echo json_encode(['success' => false, 'message' => 'Format IP address tidak valid!']);
            exit();
        } else {
            // Cek apakah pool dengan nama yang sama sudah ada (kecuali pool yang sedang diedit)
            $cek_sql = "SELECT id FROM ip_pools WHERE name = ? AND id != ?";
            $cek_stmt = $conn->prepare($cek_sql);
            $cek_stmt->bind_param("si", $name, $id);
            $cek_stmt->execute();
            $cek_stmt->store_result();
            if ($cek_stmt->num_rows > 0) {
                echo json_encode(['success' => false, 'message' => 'Pool dengan nama tersebut sudah ada!']);
                $cek_stmt->close();
                exit();
            }
            $cek_stmt->close();

            $sql = "UPDATE ip_pools SET name = ?, start_ip = ?, end_ip = ?, gateway = ? WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssssi", $name, $start_ip, $end_ip, $gateway, $id);

            if ($stmt->execute()) {
                // Update semua paket yang menggunakan pool ini
                $update_pakets_sql = "UPDATE paket_bandwidth SET local_address = ? WHERE remote_address = ?";
                $update_pakets_stmt = $conn->prepare($update_pakets_sql);
                $update_pakets_stmt->bind_param("ss", $gateway, $name);
                $update_pakets_stmt->execute();
                $update_pakets_stmt->close();

                echo json_encode(['success' => true, 'message' => 'IP Pool berhasil diperbarui!']);
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

// Handle hapus IP Pool
if (isset($_GET['action']) && $_GET['action'] == 'delete') {
    $id = cleanInput($_GET['id']);
    $sql = "DELETE FROM ip_pools WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'IP Pool berhasil dihapus!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error: ' . $stmt->error]);
    }
    $stmt->close();
    exit();
}

// Ambil data IP Pool untuk refresh
if (isset($_GET['action']) && $_GET['action'] == 'get_pools') {
    $sql = "SELECT * FROM ip_pools ORDER BY name";
    $result = $conn->query($sql);
    $pools = [];
    if ($result->num_rows > 0) {
        while($row = $result->fetch_assoc()) {
            $pools[] = [
                'name' => $row['name'],
                'ranges' => $row['start_ip'] . '-' . $row['end_ip'],
                'next_pool' => '',
                'comment' => 'Pool ' . $row['name'] . ' (' . $row['start_ip'] . ' - ' . $row['end_ip'] . ') - Gateway: ' . $row['gateway']
            ];
        }
    }
    echo json_encode(['success' => true, 'pools' => $pools]);
    exit();
}

// Jika tidak ada action yang valid
echo json_encode(['success' => false, 'message' => 'Aksi tidak valid!']);
?>