<?php

use PHPUnit\Framework\TestCase;

class WAHelperTest extends TestCase
{
    /**
     * Test buildWAMessage replacement logic
     */
    public function testBuildWAMessage(): void
    {
        $template = "Halo {nama}, tagihan {paket} sebesar Rp {harga} untuk bulan {bulan} telah terbit.";
        $data = [
            'nama' => 'John Doe',
            'paket' => '10 Mbps',
            'harga' => 100000,
            'bulan' => 'April 2026'
        ];

        $expected = "Halo John Doe, tagihan 10 Mbps sebesar Rp 100.000 untuk bulan April 2026 telah terbit.";
        $result = buildWAMessage($template, $data);

        $this->assertEquals($expected, $result);
    }

    /**
     * Test buildWALink normalization and encoding
     */
    public function testBuildWALink(): void
    {
        // Format 08xx
        $no_wa = '08123456789';
        $pesan = 'Hello World';
        $link = buildWALink($no_wa, $pesan);
        $this->assertStringContainsString('628123456789', $link);
        $this->assertStringContainsString('Hello+World', $link);

        // Format already 62
        $no_wa = '628123456789';
        $link = buildWALink($no_wa, $pesan);
        $this->assertStringStartsWith('https://wa.me/628123456789', $link);

        // Format with symbols
        $no_wa = '+62 812-3456-789';
        $link = buildWALink($no_wa, $pesan);
        $this->assertStringStartsWith('https://wa.me/628123456789', $link);
    }

    /**
     * Test getAppSetting with Mock Database
     */
    public function testGetAppSetting(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->createMock(mysqli_stmt::class);
        $mockResult = $this->createMock(mysqli_result::class);

        $mockConn->expects($this->once())
                 ->method('prepare')
                 ->willReturn($mockStmt);

        $mockStmt->expects($this->once())
                 ->method('bind_param')
                 ->with('s', 'test_key');

        $mockStmt->expects($this->once())
                 ->method('execute');

        $mockStmt->expects($this->once())
                 ->method('get_result')
                 ->willReturn($mockResult);

        $mockResult->expects($this->once())
                   ->method('fetch_assoc')
                   ->willReturn(['setting_value' => 'test_value']);

        $result = getAppSetting($mockConn, 'test_key');
        $this->assertEquals('test_value', $result);
    }

    /**
     * Test getWATemplate with Mock
     */
    public function testGetWATemplate(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->createMock(mysqli_stmt::class);
        $mockResult = $this->createMock(mysqli_result::class);

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        $mockResult->method('fetch_assoc')->willReturn([
            'jenis' => 'tagihan',
            'isi_pesan' => 'Template'
        ]);

        $template = getWATemplate($mockConn, 'tagihan');
        $this->assertIsArray($template);
        $this->assertEquals('tagihan', $template['jenis']);
    }

    /**
     * Test buildWALinkFromTagihan (Success Path)
     * This tests all internal calls work together
     */
    public function testBuildWALinkFromTagihanSuccess(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        
        // Mocking can be complex because of procedural internal calls to mysqli
        // In a real project, we'd refactor to a DB class, but for now we skip complex chain 
        // if it gets too messy, or provide a robust mock for the main query.
        
        $mockStmt = $this->getMockBuilder(mysqli_stmt::class)
                         ->disableOriginalConstructor()
                         ->getMock();
        
        $mockResult = $this->getMockBuilder(mysqli_result::class)
                           ->disableOriginalConstructor()
                           ->getMock();

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        
        // Return tagihan data on first fetch
        $mockResult->method('fetch_assoc')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'nama' => 'Irfan',
                'no_wa' => '08123',
                'paket_name' => 'Gold',
                'price' => 200000,
                'tanggal_tagihan' => '2026-04-01',
                'tanggal_jatuh_tempo' => '2026-04-10',
                'tanggal_bayar' => null
            ],
            ['setting_value' => 'MyISP'], // for getAppSetting call 1
            ['setting_value' => '12345'], // for getAppSetting call 2
            ['isi_pesan' => 'Halo {nama}'] // for getWATemplate
        );

        $link = buildWALinkFromTagihan($mockConn, 1, 'tagihan');
        $this->assertNotNull($link);
        $this->assertStringContainsString('628123', $link);
        $this->assertStringContainsString('Halo+Irfan', $link);
    }

    /**
     * Test buildWALinkFromTagihan returns null when tagihan not found
     */
    public function testBuildWALinkFromTagihanNotFound(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->getMockBuilder(mysqli_stmt::class)->disableOriginalConstructor()->getMock();
        $mockResult = $this->getMockBuilder(mysqli_result::class)->disableOriginalConstructor()->getMock();

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        $mockResult->method('fetch_assoc')->willReturn(null);

        $link = buildWALinkFromTagihan($mockConn, 999, 'tagihan');
        $this->assertNull($link);
    }

    /**
     * Test buildWALinkFromTagihan returns null when template not found
     */
    public function testBuildWALinkFromTagihanNoTemplate(): void
    {
        $mockConn = $this->createMock(mysqli::class);
        $mockStmt = $this->getMockBuilder(mysqli_stmt::class)->disableOriginalConstructor()->getMock();
        $mockResult = $this->getMockBuilder(mysqli_result::class)->disableOriginalConstructor()->getMock();

        $mockConn->method('prepare')->willReturn($mockStmt);
        $mockStmt->method('get_result')->willReturn($mockResult);
        
        // Return tagihan data but then null for template
        $mockResult->method('fetch_assoc')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'nama' => 'Irfan',
                'no_wa' => '08123',
                'paket_name' => 'Gold',
                'price' => 200000,
                'tanggal_tagihan' => '2026-04-01',
                'tanggal_jatuh_tempo' => '2026-04-10',
                'tanggal_bayar' => null
            ],
            ['setting_value' => 'MyISP'], // getAppSetting 1
            ['setting_value' => '12345'], // getAppSetting 2
            null // getWATemplate returns null
        );

        $link = buildWALinkFromTagihan($mockConn, 1, 'invalid_jenis');
        $this->assertNull($link);
    }
}
