<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\WhatsAppAPI;
use PHPUnit\Framework\TestCase;

class WhatsAppAPITest extends TestCase
{
    public function testFallbackReturnsWaMeUrlWhenGatewayUnavailable(): void
    {
        $_ENV['WA_GATEWAY_URL'] = '';
        $_ENV['WA_API_KEY'] = '';
        $_ENV['WA_FALLBACK_WA_ME'] = 'true';

        $result = (new WhatsAppAPI())->sendText('6281234567890', 'Halo');

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('fallback_url', $result);
        $this->assertStringStartsWith('https://wa.me/6281234567890', $result['fallback_url']);
    }
}
