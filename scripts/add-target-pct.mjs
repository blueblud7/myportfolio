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
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Connected to Neon");

await client.query(`
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS target_pct DOUBLE PRECISION NOT NULL DEFAULT 0;
`);
console.log("✅ accounts.target_pct 컬럼 추가 완료 (이미 있으면 스킵)");

await client.end();
