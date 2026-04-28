<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Tagihan;
use PHPUnit\Framework\TestCase;

class TagihanStatusTest extends TestCase
{
    // ------------------------------------------------------------------ //
    //  computeDisplayStatus
    // ------------------------------------------------------------------ //

    public function testLunasAlwaysReturnsLunas(): void
    {
        $row = ['status' => 'lunas', 'tgl_jatuh_tempo' => '2026-01-01', 'total_unpaid_count' => 0];
        $this->assertSame('lunas', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarBeforeDueDateReturnsBelumBayar(): void
    {
        // Set a due date far in the future
        $future = date('Y-m-d', strtotime('+30 days'));
        $row = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $future, 'total_unpaid_count' => 1];
        $this->assertSame('belum_bayar', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarPastDueSingleBillReturnsJatuhTempo(): void
    {
        $past = date('Y-m-d', strtotime('-5 days'));
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'menunggak_after_days' => 30];
        $this->assertSame('jatuh_tempo', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarPastDueThirtyDaysReturnsMenunggak(): void
    {
        $past = date('Y-m-d', strtotime('-35 days'));
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'menunggak_after_days' => 30];
        $this->assertSame('menunggak', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarPastDueCustomThresholdReturnsMenunggak(): void
    {
        $past = date('Y-m-d', strtotime('-10 days'));
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'menunggak_after_days' => 7];
        $this->assertSame('menunggak', Tagihan::computeDisplayStatus($row));
    }

    public function testMissingDueDateReturnsBelumBayar(): void
    {
        $row = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => null, 'menunggak_after_days' => 30];
        $this->assertSame('belum_bayar', Tagihan::computeDisplayStatus($row));
    }

    public function testTodayExactDueDateReturnsJatuhTempo(): void
    {
        $today = date('Y-m-d');
        $row   = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $today, 'menunggak_after_days' => 30];
        $this->assertSame('jatuh_tempo', Tagihan::computeDisplayStatus($row));
    }

    public function testNonBelumBayarStatusPassthroughsUntouched(): void
    {
        $row = ['status' => 'menunggu_wa', 'tgl_jatuh_tempo' => '2026-01-01', 'menunggak_after_days' => 30];
        $this->assertSame('menunggu_wa', Tagihan::computeDisplayStatus($row));
    }

    // ------------------------------------------------------------------ //
    //  displayStatusBadge
    // ------------------------------------------------------------------ //

    public function testBadgeClassMappings(): void
    {
        $this->assertSame('success',   Tagihan::displayStatusBadge('lunas'));
        $this->assertSame('warning',   Tagihan::displayStatusBadge('jatuh_tempo'));
        $this->assertSame('danger',    Tagihan::displayStatusBadge('menunggak'));
        $this->assertSame('secondary', Tagihan::displayStatusBadge('belum_bayar'));
        $this->assertSame('secondary', Tagihan::displayStatusBadge('menunggu_wa'));
    }

    // ------------------------------------------------------------------ //
    //  displayStatusLabel
    // ------------------------------------------------------------------ //

    public function testLabelMappings(): void
    {
        $this->assertSame('Lunas',        Tagihan::displayStatusLabel('lunas'));
        $this->assertSame('Jatuh Tempo',  Tagihan::displayStatusLabel('jatuh_tempo'));
        $this->assertSame('Menunggak',    Tagihan::displayStatusLabel('menunggak'));
        $this->assertSame('Belum Bayar',  Tagihan::displayStatusLabel('belum_bayar'));
        $this->assertSame('Menunggu WA',  Tagihan::displayStatusLabel('menunggu_wa'));
    }

    public function testGenerateInvoiceNumberUsesRequestedFormat(): void
    {
        $invoice = Tagihan::generateInvoiceNumber([
            'tgl_bayar' => '2026-04-12 10:30:00',
            'id_pelanggan' => 15,
            'nama_paket' => 'Home 20Mbps',
            'invoice_sequence' => 3,
        ]);

        $this->assertSame('12-04-2026/15/20/003', $invoice);
    }

    public function testExtractPackageSpeedReturnsNaWhenMissingDigits(): void
    {
        $this->assertSame('NA', Tagihan::extractPackageSpeed('Paket Rumahan'));
    }
}
