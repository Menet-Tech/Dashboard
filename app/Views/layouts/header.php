<?php

use App\Core\Session;
use App\Models\Pengaturan;

$flashSuccess = Session::getFlash('success');
$flashError = Session::getFlash('error');
$pageTitle = $title ?? 'Dashboard';
$appName = Pengaturan::get('nama_isp', 'Menet-Tech Dashboard');
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($pageTitle) ?> - <?= htmlspecialchars($appName) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="<?= base_url('/assets/css/app.css') ?>">
</head>
<body>
<div class="app-shell">
    <?php if ($flashSuccess): ?>
        <div class="toast-holder"><div class="alert alert-success shadow-sm"><?= htmlspecialchars((string) $flashSuccess) ?></div></div>
    <?php endif; ?>
    <?php if ($flashError): ?>
        <div class="toast-holder"><div class="alert alert-danger shadow-sm"><?= htmlspecialchars((string) $flashError) ?></div></div>
    <?php endif; ?>
