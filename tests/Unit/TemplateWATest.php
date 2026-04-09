<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TemplateWA;
use PHPUnit\Framework\TestCase;

class TemplateWATest extends TestCase
{
    public function testParseReplacesKnownPlaceholders(): void
    {
        $message = TemplateWA::parse(
            'Halo {nama}, paket {paket}, nominal {harga}, periode {periode}.',
            [
                'nama' => 'Budi',
                'nama_paket' => 'Home 20Mbps',
                'harga' => 250000,
                'periode' => '2026-04-01',
            ]
        );

        $this->assertStringContainsString('Budi', $message);
        $this->assertStringContainsString('Home 20Mbps', $message);
        $this->assertStringContainsString('250.000', $message);
    }
}
