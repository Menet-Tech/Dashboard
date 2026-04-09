<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Pelanggan;
use PHPUnit\Framework\TestCase;

class PelangganDueDateTest extends TestCase
{
    public function testNormalizeDueDayStoresCanonicalDate(): void
    {
        $this->assertSame('2000-01-08', Pelanggan::normalizeDueDay(8));
    }

    public function testResolveDueDateUsesBillingPeriodMonth(): void
    {
        $this->assertSame('2026-04-08', Pelanggan::resolveDueDateFromStored('2000-01-08', '2026-04-01'));
    }

    public function testResolveDueDateClampsToMonthEnd(): void
    {
        $this->assertSame('2026-02-28', Pelanggan::resolveDueDateForPeriod(31, '2026-02-01'));
    }
}
