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
                'nama'      => 'Budi',
                'nama_paket' => 'Home 20Mbps',
                'harga'     => 250000,
                'periode'   => '2026-04-01',
            ]
        );

        $this->assertStringContainsString('Budi', $message);
        $this->assertStringContainsString('Home 20Mbps', $message);
        $this->assertStringContainsString('250.000', $message);
        $this->assertStringContainsString('April 2026', $message);
    }

    public function testParseLunasTemplateIncludesTanggalBayar(): void
    {
        $message = TemplateWA::parse(
            'Terima kasih {nama}, pembayaran lunas pada {tanggal_bayar} untuk {bulan}.',
            [
                'nama'      => 'Siti',
                'harga'     => 150000,
                'periode'   => '2026-04-01',
                'tgl_bayar' => '2026-04-05 10:30:00',
            ]
        );

        $this->assertStringContainsString('Siti', $message);
        $this->assertStringContainsString('05/04/2026', $message);
        $this->assertStringContainsString('April 2026', $message);
    }

    public function testParseTanggalBayarPlaceholderShowsDashWhenAbsent(): void
    {
        $message = TemplateWA::parse('{tanggal_bayar}', ['nama' => 'X']);
        $this->assertSame('-', $message);
    }

    public function testParseJatuhTempoPlaceholder(): void
    {
        $message = TemplateWA::parse(
            'Jatuh tempo: {jatuh_tempo}',
            [
                'tgl_jatuh_tempo' => '2000-01-08',
                'periode'         => '2026-04-01',
            ]
        );

        $this->assertStringContainsString('08/04/2026', $message);
    }

    public function testParseHargaFormatsThousandSeparator(): void
    {
        $message = TemplateWA::parse('{harga}', ['harga' => 1000000]);
        $this->assertSame('1.000.000', $message);
    }

    public function testParseNoWaPlaceholder(): void
    {
        $message = TemplateWA::parse('{no_wa}', ['no_wa' => '6281234567890']);
        $this->assertSame('6281234567890', $message);
    }

    public function testParseSupportsInvoiceAndPaymentStatusPlaceholders(): void
    {
        $message = TemplateWA::parse(
            'Invoice {invoice_number} status {status_pembayaran} limit {hari_limit} hari',
            [
                'invoice_number' => '12-04-2026/15/20/003',
                'display_status' => 'lunas',
            ]
        );

        $this->assertStringContainsString('12-04-2026/15/20/003', $message);
        $this->assertStringContainsString('Lunas', $message);
        $this->assertStringContainsString('5', $message);
    }
}
