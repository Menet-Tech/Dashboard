<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Pelanggan;
use PHPUnit\Framework\TestCase;

class PelangganDueDateTest extends TestCase
{
    // ------------------------------------------------------------------ //
    //  normalizeDueDay
    // ------------------------------------------------------------------ //

    public function testNormalizeDueDayStoresCanonicalDate(): void
    {
        $this->assertSame('2000-01-08', Pelanggan::normalizeDueDay(8));
    }

    public function testNormalizeDueDayClampsMinToOne(): void
    {
        $this->assertSame('2000-01-01', Pelanggan::normalizeDueDay(0));
    }

    public function testNormalizeDueDayClampsMaxTo31(): void
    {
        $this->assertSame('2000-01-31', Pelanggan::normalizeDueDay(99));
    }

    // ------------------------------------------------------------------ //
    //  extractDueDay
    // ------------------------------------------------------------------ //

    public function testExtractDueDayReturnsCorrectDay(): void
    {
        $this->assertSame(8, Pelanggan::extractDueDay('2000-01-08'));
    }

    public function testExtractDueDayReturnsOneWhenNull(): void
    {
        $this->assertSame(1, Pelanggan::extractDueDay(null));
    }

    public function testExtractDueDayReturnsOneWhenEmpty(): void
    {
        $this->assertSame(1, Pelanggan::extractDueDay(''));
    }

    // ------------------------------------------------------------------ //
    //  resolveDueDateFromStored / resolveDueDateForPeriod
    // ------------------------------------------------------------------ //

    public function testResolveDueDateUsesBillingPeriodMonth(): void
    {
        $this->assertSame('2026-04-08', Pelanggan::resolveDueDateFromStored('2000-01-08', '2026-04-01'));
    }

    public function testResolveDueDateClampsToMonthEnd(): void
    {
        $this->assertSame('2026-02-28', Pelanggan::resolveDueDateForPeriod(31, '2026-02-01'));
    }

    public function testResolveDueDateFirstDayOfMonth(): void
    {
        $this->assertSame('2026-03-01', Pelanggan::resolveDueDateForPeriod(1, '2026-03-01'));
    }

    public function testResolveDueDateDay28IsValidInFebruary(): void
    {
        $this->assertSame('2026-02-28', Pelanggan::resolveDueDateForPeriod(28, '2026-02-01'));
    }

    public function testResolveDueDateDay29ClampsToFeb28NonLeap(): void
    {
        $this->assertSame('2026-02-28', Pelanggan::resolveDueDateForPeriod(29, '2026-02-01'));
    }

    public function testResolveDueDateLeapYearFeb29(): void
    {
        $this->assertSame('2024-02-29', Pelanggan::resolveDueDateForPeriod(29, '2024-02-01'));
    }

    public function testResolveDueDateUsesCurrentMonthWhenNoPeriod(): void
    {
        $result = Pelanggan::resolveDueDateForPeriod(15);
        $expectedMonth = date('Y-m');
        $this->assertStringStartsWith($expectedMonth, $result);
        $this->assertStringEndsWith('-15', $result);
    }
}
