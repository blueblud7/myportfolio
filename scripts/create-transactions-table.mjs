/**
 * Neon에 transactions 테이블 생성
 * 사용법: node scripts/create-transactions-table.mjs
 */
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnv() {
  const envFile = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();
console.log("Connected to Neon");

await client.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('buy','sell','dividend','deposit','withdrawal')),
    ticker TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    fees DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency IN ('KRW','USD')),
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

console.log("✅ transactions 테이블 생성 완료 (이미 있으면 스킵)");
await client.end();
