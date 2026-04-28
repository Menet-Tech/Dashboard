<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\ServiceStatus;
use PHPUnit\Framework\TestCase;

class ServiceStatusTest extends TestCase
{
    public function testSnapshotUsesCachedMessageWhenAvailable(): void
    {
        $snapshot = ServiceStatus::snapshot('online 2026-04-12 10:00:00', ['status' => 'failed', 'message' => 'old'], 'fallback');

        $this->assertFalse($snapshot['success']);
        $this->assertSame('online 2026-04-12 10:00:00', $snapshot['message']);
    }

    public function testSnapshotFallsBackToHealthRowMessage(): void
    {
        $snapshot = ServiceStatus::snapshot('', ['status' => 'ok', 'message' => 'WA Gateway sehat'], 'fallback');

        $this->assertTrue($snapshot['success']);
        $this->assertSame('WA Gateway sehat', $snapshot['message']);
    }

    public function testSnapshotFallsBackToDefaultMessageWhenDataEmpty(): void
    {
        $snapshot = ServiceStatus::snapshot('', null, 'Belum ada heartbeat');

        $this->assertFalse($snapshot['success']);
        $this->assertSame('Belum ada heartbeat', $snapshot['message']);
    }

    public function testSnapshotMarksHealthyKeywordMessagesAsSuccess(): void
    {
        $snapshot = ServiceStatus::snapshot('berhasil terkoneksi ke RouterOS', null, 'fallback');

        $this->assertTrue($snapshot['success']);
    }

    public function testSnapshotFailedHealthRowOverridesHealthyWords(): void
    {
        $snapshot = ServiceStatus::snapshot('online tetapi gagal', ['status' => 'failed', 'message' => 'router down'], 'fallback');

        $this->assertFalse($snapshot['success']);
        $this->assertSame('online tetapi gagal', $snapshot['message']);
    }
}
