<?php

declare(strict_types=1);

namespace App\Models;

class WhatsAppAPI
{
    private string $baseUrl;
    private string $apiKey;
    private string $accountId;

    public function __construct()
    {
        $this->baseUrl = (string) Pengaturan::get('wa_gateway_url', 'http://localhost:3000');
        $this->apiKey = (string) Pengaturan::get('wa_api_key', '');
        $this->accountId = (string) Pengaturan::get('wa_account_id', 'default');
    }

    public function sendText(string $to, string $message): array
    {
        if ($this->baseUrl === '' || $this->apiKey === '') {
            return $this->fallback($to, $message, 'WA Gateway belum dikonfigurasi');
        }

        $payload = json_encode([
            'to' => preg_replace('/\D+/', '', $to),
            'text' => $message,
        ], JSON_THROW_ON_ERROR);

        $ch = curl_init(rtrim($this->baseUrl, '/') . '/api/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-API-Key: ' . $this->apiKey,
                'X-Account-Id: ' . $this->accountId,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return $this->fallback($to, $message, 'cURL Error: ' . $error);
        }

        $data = json_decode((string) $response, true);
        if ($httpCode >= 200 && $httpCode < 300 && ($data['status'] ?? null) === 'success') {
            return [
                'success' => true,
                'message_id' => $data['id'] ?? ($data['data']['id'] ?? null),
                'response' => $data,
            ];
        }

        return $this->fallback($to, $message, $data['message'] ?? 'Unknown error');
    }

    private function fallback(string $to, string $message, string $error): array
    {
        if (Pengaturan::get('wa_fallback_wa_me', 'true') === 'true') {
            return [
                'success' => false,
                'error' => $error,
                'fallback_url' => 'https://wa.me/' . preg_replace('/\D+/', '', $to) . '?text=' . urlencode($message),
            ];
        }

        return ['success' => false, 'error' => $error];
    }
}
