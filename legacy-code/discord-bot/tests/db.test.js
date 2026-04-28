import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDbConfig, normalizeDbHost } from '../src/db.js';

test('normalizeDbHost maps localhost to IPv4 loopback', () => {
  assert.equal(normalizeDbHost('localhost'), '127.0.0.1');
  assert.equal(normalizeDbHost('::1'), '127.0.0.1');
  assert.equal(normalizeDbHost(''), '127.0.0.1');
});

test('normalizeDbHost keeps explicit remote host unchanged', () => {
  assert.equal(normalizeDbHost('192.168.10.1'), '192.168.10.1');
  assert.equal(normalizeDbHost('db.internal'), 'db.internal');
});

test('buildDbConfig applies defaults and normalized host', () => {
  const config = buildDbConfig({ DB_HOST: 'localhost' });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3306);
  assert.equal(config.database, 'dashboard');
  assert.equal(config.user, 'root');
  assert.equal(config.password, '');
});

test('buildDbConfig respects explicit values', () => {
  const config = buildDbConfig({
    DB_HOST: '10.0.0.5',
    DB_PORT: '3307',
    DB_NAME: 'prod_dashboard',
    DB_USER: 'billing',
    DB_PASS: 'secret'
  });

  assert.equal(config.host, '10.0.0.5');
  assert.equal(config.port, 3307);
  assert.equal(config.database, 'prod_dashboard');
  assert.equal(config.user, 'billing');
  assert.equal(config.password, 'secret');
});
