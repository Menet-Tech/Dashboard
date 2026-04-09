import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let pool;

export function getDb() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME || 'dashboard',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      waitForConnections: true,
      connectionLimit: 10
    });
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
