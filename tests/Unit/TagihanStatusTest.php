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
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'total_unpaid_count' => 1];
        $this->assertSame('jatuh_tempo', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarPastDueTwoBillsReturnsMenunggak(): void
    {
        $past = date('Y-m-d', strtotime('-35 days'));
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'total_unpaid_count' => 2];
        $this->assertSame('menunggak', Tagihan::computeDisplayStatus($row));
    }

    public function testBelumBayarPastDueThreeBillsReturnsMenunggak(): void
    {
        $past = date('Y-m-d', strtotime('-65 days'));
        $row  = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $past, 'total_unpaid_count' => 3];
        $this->assertSame('menunggak', Tagihan::computeDisplayStatus($row));
    }

    public function testMissingDueDateReturnsBelumBayar(): void
    {
        $row = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => null, 'total_unpaid_count' => 2];
        $this->assertSame('belum_bayar', Tagihan::computeDisplayStatus($row));
    }

    public function testTodayExactDueDateReturnsJatuhTempo(): void
    {
        // Due exactly today with 1 unpaid bill: today is NOT > today,
        // so it falls into the past-due branch -> jatuh_tempo.
        $today = date('Y-m-d');
        $row   = ['status' => 'belum_bayar', 'tgl_jatuh_tempo' => $today, 'total_unpaid_count' => 1];
        $this->assertSame('jatuh_tempo', Tagihan::computeDisplayStatus($row));
    }

    public function testNonBelumBayarStatusPassthroughsUntouched(): void
    {
        $row = ['status' => 'menunggu_wa', 'tgl_jatuh_tempo' => '2026-01-01', 'total_unpaid_count' => 1];
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
}
