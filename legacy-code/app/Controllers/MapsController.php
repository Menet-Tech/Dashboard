<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Models\Pelanggan;

class MapsController extends Controller
{
    public function index(): void
    {
        $this->view('maps/index', [
            'title' => 'Maps Pelanggan',
            'rows' => (new Pelanggan())->allMapData(),
        ]);
    }
}
