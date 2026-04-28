<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class DiscordHelperTest extends TestCase
{
    public function testDiscordRouteOptionsContainSupportedTargets(): void
    {
        $options = discordRouteOptions();

        $this->assertSame('Nonaktif', $options['none']);
        $this->assertSame('Alert saja', $options['alert']);
        $this->assertSame('Billing saja', $options['billing']);
        $this->assertSame('Keduanya', $options['both']);
    }

    public function testDiscordAlertPreferenceDefinitionsContainExpectedDefaults(): void
    {
        $definitions = discordAlertPreferenceDefinitions();

        $this->assertSame('none', $definitions['dashboard_heartbeat']['default']);
        $this->assertSame('billing', $definitions['billing_generated']['default']);
        $this->assertSame('billing', $definitions['payment_paid']['default']);
        $this->assertSame('alert', $definitions['wa_failed']['default']);
        $this->assertSame('alert', $definitions['mikrotik_failed']['default']);
    }

    public function testDiscordChannelsFromPreferenceSupportsAllModes(): void
    {
        $this->assertSame([], discordChannelsFromPreference('none'));
        $this->assertSame(['alert'], discordChannelsFromPreference('alert'));
        $this->assertSame(['billing'], discordChannelsFromPreference('billing'));
        $this->assertSame(['alert', 'billing'], discordChannelsFromPreference('both'));
        $this->assertSame(['billing'], discordChannelsFromPreference('unknown', 'billing'));
    }

    public function testDiscordColorMappingsRemainStable(): void
    {
        $this->assertSame(hexdec('16A34A'), discordColor('success'));
        $this->assertSame(hexdec('D97706'), discordColor('warning'));
        $this->assertSame(hexdec('DC2626'), discordColor('danger'));
        $this->assertSame(hexdec('0F766E'), discordColor('info'));
    }
}
