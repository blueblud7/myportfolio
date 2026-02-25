import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

// OneDrive 등 클라우드 동기화 폴더에서는 SQLite WAL 모드가 충돌하므로
// 로컬 홈 디렉토리에 DB를 저장
const DB_DIR = path.join(os.homedir(), ".myportfolio");
const DB_PATH = path.join(DB_DIR, "portfolio.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stock', 'bank')),
      currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency IN ('KRW', 'USD')),
      broker TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency IN ('KRW', 'USD')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      price REAL NOT NULL,
      change_pct REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      UNIQUE(ticker, date)
    );

    CREATE TABLE IF NOT EXISTS bank_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      balance REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_krw REAL NOT NULL DEFAULT 0,
      total_usd REAL NOT NULL DEFAULT 0,
      stock_krw REAL NOT NULL DEFAULT 0,
      bank_krw REAL NOT NULL DEFAULT 0,
      exchange_rate REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rate REAL NOT NULL,
      date TEXT NOT NULL UNIQUE
    );
  `);
}

export default getDb;
