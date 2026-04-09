<?php

use PHPUnit\Framework\TestCase;

class DiscordHelperTest extends TestCase
{
    /**
     * Test getDiscordWebhook wrapper
     */
    public function testGetDiscordWebhook(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->createMock(mysqli_stmt::class);
        $mockResult = $this->createMock(mysqli_result::class);

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        $mockResult->method('fetch_assoc')->willReturn(['setting_value' => 'https://discord.com/api/webhooks/123']);

        $url = getDiscordWebhook($mockConn, 'discord_webhook_tagihan');
        $this->assertEquals('https://discord.com/api/webhooks/123', $url);
    }

    /**
     * Test sendDiscordWebhook validation
     */
    public function testSendDiscordWebhookValidation(): void
    {
        // Test empty URL
        $this->assertFalse(sendDiscordWebhook('', 'Hello'));
        
        // Test empty payload
        $this->assertFalse(sendDiscordWebhook('https://webhook.url', ''));
    }

    /**
     * Test notifyDiscordGenerateTagihan returns false if no webhook configured
     */
    public function testNotifyDiscordGenerateTagihanNoWebhook(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->createMock(mysqli_stmt::class);
        $mockResult = $this->createMock(mysqli_result::class);

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        $mockResult->method('fetch_assoc')->willReturn(null); // No setting found

        $result = notifyDiscordGenerateTagihan($mockConn, 5, 2, 10);
        $this->assertFalse($result);
    }
}
