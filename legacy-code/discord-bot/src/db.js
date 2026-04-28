import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let pool;

export function normalizeDbHost(host) {
  const normalized = String(host || '').trim().toLowerCase();

  if (normalized === '' || normalized === 'localhost' || normalized === '::1') {
    return '127.0.0.1';
  }

  return String(host).trim();
}

export function buildDbConfig(env = process.env) {
  return {
    host: normalizeDbHost(env.DB_HOST || '127.0.0.1'),
    port: Number(env.DB_PORT || 3306),
    database: env.DB_NAME || 'dashboard',
    user: env.DB_USER || 'root',
    password: env.DB_PASS || '',
    waitForConnections: true,
    connectionLimit: 10
  };
}

export function getDb() {
  if (!pool) {
    pool = mysql.createPool(buildDbConfig(process.env));
  }

  return pool;
}

export async function getSetting(key, fallback = '') {
  const db = getDb();
  const [rows] = await db.query('SELECT `value` FROM pengaturan WHERE `key` = ? LIMIT 1', [key]);
  if (rows.length > 0 && rows[0].value !== '') {
    return rows[0].value;
  }

  return fallback;
}

export async function query(sql, params = []) {
  const db = getDb();
  const [rows] = await db.query(sql, params);
  return rows;
}

export async function execute(sql, params = []) {
  const db = getDb();
  const [result] = await db.execute(sql, params);
  return result;
}
