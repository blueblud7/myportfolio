-- Run this in Neon SQL Editor to initialize the database

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('stock', 'bank')),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency IN ('KRW', 'USD')),
  broker TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency IN ('KRW', 'USD')),
  note TEXT NOT NULL DEFAULT '',
  manual_price DOUBLE PRECISION,
  date TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  change_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  UNIQUE(ticker, date)
);

CREATE TABLE IF NOT EXISTS bank_balances (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  balance DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  total_krw DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_krw DOUBLE PRECISION NOT NULL DEFAULT 0,
  bank_krw DOUBLE PRECISION NOT NULL DEFAULT 0,
  exchange_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  date TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  rate DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS broker_credentials (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE,
  broker TEXT NOT NULL DEFAULT 'kiwoom',
  app_key TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  account_number TEXT NOT NULL,
  last_synced_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diary (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  mood TEXT NOT NULL DEFAULT 'neutral',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS stock_metadata (
  ticker TEXT PRIMARY KEY,
  sector TEXT DEFAULT '',
  annual_dividend DOUBLE PRECISION DEFAULT 0,
  dividend_yield DOUBLE PRECISION DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS benchmark_prices (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  UNIQUE(symbol, date)
);

CREATE TABLE IF NOT EXISTS dividend_schedule (
  ticker TEXT PRIMARY KEY,
  ex_dividend_date TEXT,
  dividend_frequency TEXT NOT NULL DEFAULT 'annual',
  per_share_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
