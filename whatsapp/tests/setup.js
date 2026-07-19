// tests/setup.js
// Set environment variables sebelum semua test berjalan
const os = require('os');
const path = require('path');
const fs = require('fs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-gateway-jest-'));
process.env.WA_DB_PATH = path.join(tempDir, 'test_gateway.sqlite');

process.env.PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.LOG_LEVEL = 'error'; // Suppress logs saat testing
process.env.PUBLIC_URL = 'http://localhost:3001';
process.env.WEBHOOK_URLS = '[]';
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '1000'; // Agar test tidak terkena rate limit
process.env.IP_WHITELIST = ''; // Izinkan semua IP saat testing
