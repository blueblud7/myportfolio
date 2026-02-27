/**
 * SQLite → Neon(PostgreSQL) 데이터 마이그레이션 스크립트
 *
 * 사용법:
 *   DATABASE_URL="postgresql://..." node scripts/migrate-to-neon.mjs
 *   또는
 *   DATABASE_URL="postgresql://..." node scripts/migrate-to-neon.mjs ./data/portfolio.db
 */

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DB_PATH = process.argv[2] ?? path.join(ROOT, "data/portfolio.db");

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
  console.error("   .env.local 파일에 DATABASE_URL=postgresql://... 추가하거나");
  console.error("   예) DATABASE_URL=postgresql://... node scripts/migrate-to-neon.mjs");
  process.exit(1);
}

const sqlite = new Database(DB_PATH, { readonly: true });
const sql = neon(DATABASE_URL);

// ─── 테이블 정의 (삽입 순서 중요: FK 의존성) ────────────────────────────────
const TABLES = [
  {
    name: "users",
    serial: "id",
    columns: ["id", "username", "password_hash"],
  },
  {
    name: "accounts",
    serial: "id",
    columns: ["id", "name", "type", "currency", "broker", "created_at"],
  },
  {
    name: "holdings",
    serial: "id",
    columns: ["id", "account_id", "ticker", "name", "quantity", "avg_cost", "currency", "note", "manual_price", "date"],
  },
  {
    name: "price_history",
    serial: "id",
    columns: ["id", "ticker", "price", "change_pct", "date"],
  },
  {
    name: "bank_balances",
    serial: "id",
    columns: ["id", "account_id", "balance", "date", "note"],
  },
  {
    name: "snapshots",
    serial: "id",
    columns: ["id", "total_krw", "total_usd", "stock_krw", "bank_krw", "exchange_rate", "date"],
  },
  {
    name: "exchange_rates",
    serial: "id",
    columns: ["id", "rate", "date"],
  },
  {
    name: "broker_credentials",
    serial: "id",
    columns: ["id", "account_id", "broker", "app_key", "secret_key", "account_number", "last_synced_at"],
  },
  {
    name: "diary",
    serial: "id",
    columns: ["id", "title", "content", "date", "mood", "tags", "created_at", "updated_at"],
  },
  {
    name: "stock_metadata",
    serial: null, // TEXT PRIMARY KEY (ticker)
    columns: ["ticker", "sector", "annual_dividend", "dividend_yield", "updated_at"],
  },
  {
    name: "benchmark_prices",
    serial: null,
    columns: ["symbol", "date", "close"],
  },
  {
    name: "dividend_schedule",
    serial: null,
    columns: ["ticker", "ex_dividend_date", "dividend_frequency", "per_share_amount", "updated_at"],
  },
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function checkTableExists(tableName) {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(tableName);
  return !!row;
}

function readAll(tableName) {
  return sqlite.prepare(`SELECT * FROM ${tableName}`).all();
}

async function resetSequence(tableName, column) {
  await sql`
    SELECT setval(
      pg_get_serial_sequence(${tableName}, ${column}),
      COALESCE((SELECT MAX(${sql(column)}) FROM ${sql(tableName)}), 0) + 1,
      false
    )
  `;
}

async function insertRows(table, rows) {
  if (rows.length === 0) return;

  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    await sql.transaction(
      batch.map((row) => {
        const vals = table.columns.map((c) => row[c] ?? null);

        // 동적 INSERT: Neon tagged template은 배열을 직접 지원하지 않으므로
        // unsafe() 방식 사용
        const placeholders = table.columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const colList = table.columns.join(", ");

        const conflictClause =
          table.name === "benchmark_prices"
            ? "ON CONFLICT (symbol, date) DO NOTHING"
            : table.name === "price_history"
            ? "ON CONFLICT (ticker, date) DO NOTHING"
            : table.name === "stock_metadata" || table.name === "dividend_schedule"
            ? "ON CONFLICT (ticker) DO NOTHING"
            : table.name === "snapshots" || table.name === "exchange_rates"
            ? "ON CONFLICT (date) DO NOTHING"
            : table.name === "users"
            ? "ON CONFLICT (username) DO NOTHING"
            : "ON CONFLICT DO NOTHING";

        return sql.unsafe(
          `INSERT INTO ${table.name} (${colList}) VALUES (${placeholders}) ${conflictClause}`,
          vals
        );
      })
    );

    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${rows.length} 행 삽입 중...`);
  }
  console.log(`\r  ✅ ${rows.length}행 완료`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 SQLite 경로: ${DB_PATH}`);
  console.log(`🚀 Neon 마이그레이션 시작\n`);

  for (const table of TABLES) {
    if (!checkTableExists(table.name)) {
      console.log(`⏭  ${table.name} — SQLite에 없음, 건너뜀`);
      continue;
    }

    const rows = readAll(table.name);
    console.log(`📋 ${table.name}: ${rows.length}행`);

    if (rows.length === 0) continue;

    await insertRows(table, rows);

    // SERIAL 시퀀스를 최대 ID 이후로 재설정
    if (table.serial) {
      await resetSequence(table.name, table.serial);
    }
  }

  sqlite.close();
  console.log("\n🎉 마이그레이션 완료!");
}

main().catch((err) => {
  console.error("\n❌ 오류:", err);
  process.exit(1);
});
