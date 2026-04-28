<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login - Menet-Tech</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="<?= base_url('/assets/css/app.css') ?>">
</head>
<body class="login-page">
<div class="login-card">
    <div class="brand-kicker">Menet-Tech</div>
    <h1>Billing dashboard untuk operasional harian</h1>
    <p>Masuk dengan akun petugas untuk mengelola pelanggan, tagihan, peta instalasi, dan notifikasi WhatsApp.</p>
    <?php if ($error = \App\Core\Session::getFlash('error')): ?>
        <div class="alert alert-danger"><?= htmlspecialchars((string) $error) ?></div>
    <?php endif; ?>
    <form method="post" action="<?= base_url('/login') ?>" class="row g-3">
        <?= csrf_field() ?>
        <div class="col-12">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-control" value="<?= htmlspecialchars((string) old('username', 'admin')) ?>" required>
        </div>
        <div class="col-12">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" placeholder="password" required>
            <small class="text-muted">Default seed database: `admin` / `password`.</small>
        </div>
        <div class="col-12">
            <button class="btn btn-primary w-100">Masuk ke Dashboard</button>
        </div>
    </form>
</div>
</body>
</html>
