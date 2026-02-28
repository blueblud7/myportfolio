/**
 * SQLite → Neon(PostgreSQL) 데이터 마이그레이션 스크립트
 *
 * 사용법:
 *   node scripts/migrate-to-neon.mjs
 *   또는
 *   node scripts/migrate-to-neon.mjs /path/to/portfolio.db
 */

import Database from "better-sqlite3";
import pg from "pg";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DB_PATH = process.argv[2] ?? path.join(os.homedir(), ".myportfolio/portfolio.db");

// .env.local 에서 DATABASE_URL 로드
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
  console.error("❌ DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

// ─── 테이블 정의 (FK 의존성 순서) ────────────────────────────────────────────
const TABLES = [
  { name: "users",       serial: "id", columns: ["id", "username", "password_hash"] },
  { name: "accounts",    serial: "id", columns: ["id", "name", "type", "currency", "broker", "created_at"] },
  { name: "holdings",    serial: "id", columns: ["id", "account_id", "ticker", "name", "quantity", "avg_cost", "currency", "note", "manual_price", "date"] },
  { name: "price_history", serial: "id", columns: ["id", "ticker", "price", "change_pct", "date"] },
  { name: "bank_balances", serial: "id", columns: ["id", "account_id", "balance", "date", "note"] },
  { name: "snapshots",   serial: "id", columns: ["id", "total_krw", "total_usd", "stock_krw", "bank_krw", "exchange_rate", "date"] },
  { name: "exchange_rates", serial: "id", columns: ["id", "rate", "date"] },
  { name: "broker_credentials", serial: "id", columns: ["id", "account_id", "broker", "app_key", "secret_key", "account_number", "last_synced_at"] },
  { name: "diary",       serial: "id", columns: ["id", "title", "content", "date", "mood", "tags", "created_at", "updated_at"] },
  { name: "stock_metadata", serial: null, columns: ["ticker", "sector", "annual_dividend", "dividend_yield", "updated_at"] },
  { name: "benchmark_prices", serial: null, columns: ["symbol", "date", "close"] },
  { name: "dividend_schedule", serial: null, columns: ["ticker", "ex_dividend_date", "dividend_frequency", "per_share_amount", "updated_at"] },
];

function getConflict(_name) {
  return "ON CONFLICT DO NOTHING";
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📦 SQLite 경로: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ SQLite 파일 없음: ${DB_PATH}`);
    process.exit(1);
  }

  const sqlite = new Database(DB_PATH, { readonly: true });
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("🔗 Neon 연결 성공\n🚀 마이그레이션 시작\n");

  for (const table of TABLES) {
    // SQLite에 해당 테이블 있는지 확인
    const exists = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table.name);
    if (!exists) {
      console.log(`⏭  ${table.name} — SQLite에 없음, 건너뜀`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
    console.log(`📋 ${table.name}: ${rows.length}행`);
    if (rows.length === 0) continue;

    const colList = table.columns.join(", ");
    const conflict = getConflict(table.name);
    const BATCH = 100;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      // multi-row INSERT: ($1,$2,...),($n+1,$n+2,...), ...
      let idx = 1;
      const valueClauses = batch.map((row) => {
        const ph = table.columns.map(() => `$${idx++}`).join(", ");
        return `(${ph})`;
      });
      const flatVals = batch.flatMap((row) => table.columns.map((c) => row[c] ?? null));

      await client.query(
        `INSERT INTO ${table.name} (${colList}) VALUES ${valueClauses.join(", ")} ${conflict}`,
        flatVals
      );

      inserted += batch.length;
      process.stdout.write(`\r  ${inserted}/${rows.length} 행 삽입 중...`);
    }
    console.log(`\r  ✅ ${rows.length}행 완료   `);

    // SERIAL 시퀀스 재설정
    if (table.serial) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table.name}', '${table.serial}'),
          COALESCE((SELECT MAX(${table.serial}) FROM ${table.name}), 0) + 1, false)`
      );
    }
  }

  sqlite.close();
  await client.end();
  console.log("\n🎉 마이그레이션 완료!");
}

main().catch((err) => {
  console.error("\n❌ 오류:", err.message);
  process.exit(1);
});
