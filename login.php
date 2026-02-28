<?php
session_start();

// Jika user sudah login, redirect ke dashboard
if (isset($_SESSION['user_id'])) {
    header("Location: dashboard.php");
    exit();
}

$error = '';
$success = '';

// Proses login
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $username = trim($_POST['username']);
    $password = trim($_POST['password']);

    // Validasi input
    if (empty($username) || empty($password)) {
        $error = 'Username dan password harus diisi';
    } else {
        // Simulasi autentikasi (dalam aplikasi nyata, ini akan dicek ke database)
        if ($username === 'admin' && $password === '12345') {
            $_SESSION['user_id'] = 1;
            $_SESSION['username'] = $username;
            $_SESSION['login_time'] = time();
            
            header("Location: dashboard.php");
            exit();
        } else {
            $error = 'Username atau password salah';
        }
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Billing System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <i class="fas fa-shield-alt" style="font-size: 3rem; color: #667eea; margin-bottom: 15px;"></i>
            <h1>Sistem Billing</h1>
            <p>Masuk ke dashboard manajemen</p>
        </div>

        <?php if ($error): ?>
            <div class="message error">
                <i class="fas fa-exclamation-circle"></i> <?php echo $error; ?>
            </div>
        <?php endif; ?>

        <?php if ($success): ?>
            <div class="message success">
                <i class="fas fa-check-circle"></i> <?php echo $success; ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="">
            <div class="form-group">
                <label for="username">
                    <i class="fas fa-user"></i> Username
                </label>
                <input type="text" id="username" name="username" placeholder="Masukkan username" required>
            </div>

            <div class="form-group">
                <label for="password">
                    <i class="fas fa-lock"></i> Password
                </label>
                <input type="password" id="password" name="password" placeholder="Masukkan password" required>
            </div>

            <button type="submit" class="btn-login">
                <i class="fas fa-sign-in-alt"></i> Masuk
            </button>
        </form>

        <div class="demo-info">
            <strong>Info Demo:</strong><br>
            Username: admin<br>
            Password: 12345
        </div>

        <div class="login-footer">
            &copy; <?php echo date('Y'); ?> Sistem Billing. Dibuat dengan PHP.
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>