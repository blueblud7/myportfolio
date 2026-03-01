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
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^[\"']|[\"']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Connected to Neon");

await client.query(`
  CREATE TABLE IF NOT EXISTS price_alerts (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    target_price DOUBLE PRECISION NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('above','below')),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('KRW','USD')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    triggered_at TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
  );
`);
console.log("✅ price_alerts 테이블 생성 완료 (이미 있으면 스킵)");

await client.end();
