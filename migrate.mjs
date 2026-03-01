import { neon } from '@neondatabase/serverless';
import { execSync } from 'child_process';

const DB_PATH = `${process.env.HOME}/.myportfolio/portfolio.db`;
const DATABASE_URL = 'postgresql://neondb_owner:npg_39nFgZfRzLiN@ep-jolly-art-aizsugj6-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const sql = neon(DATABASE_URL);

function fromSQLite(query) {
  const result = execSync(
    `sqlite3 -json "${DB_PATH}" "${query.replace(/"/g, '\\"')}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString().trim();
  return result ? JSON.parse(result) : [];
}

async function migrate() {
  console.log('Starting migration: SQLite → Neon\n');

  // 1. users
  const users = fromSQLite('SELECT * FROM users');
  console.log(`users: ${users.length} rows`);
  for (const r of users) {
    await sql`INSERT INTO users (id, username, password_hash) VALUES (${r.id}, ${r.username}, ${r.password_hash}) ON CONFLICT (username) DO NOTHING`;
  }
  if (users.length) await sql`SELECT setval('users_id_seq', ${Math.max(...users.map(r => r.id))})`;

  // 2. accounts
  const accounts = fromSQLite('SELECT * FROM accounts');
  console.log(`accounts: ${accounts.length} rows`);
  for (const r of accounts) {
    await sql`INSERT INTO accounts (id, name, type, currency, broker, created_at)
      VALUES (${r.id}, ${r.name}, ${r.type}, ${r.currency}, ${r.broker ?? ''}, ${r.created_at ?? ''})
      ON CONFLICT DO NOTHING`;
  }
  if (accounts.length) await sql`SELECT setval('accounts_id_seq', ${Math.max(...accounts.map(r => r.id))})`;

  // 3. holdings
  const holdings = fromSQLite('SELECT * FROM holdings');
  console.log(`holdings: ${holdings.length} rows`);
  for (const r of holdings) {
    await sql`INSERT INTO holdings (id, account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date)
      VALUES (${r.id}, ${r.account_id}, ${r.ticker}, ${r.name}, ${r.quantity}, ${r.avg_cost}, ${r.currency}, ${r.note ?? ''}, ${r.manual_price ?? null}, ${r.date ?? ''})
      ON CONFLICT DO NOTHING`;
  }
  if (holdings.length) await sql`SELECT setval('holdings_id_seq', ${Math.max(...holdings.map(r => r.id))})`;

  // 4. bank_balances
  const bb = fromSQLite('SELECT * FROM bank_balances');
  console.log(`bank_balances: ${bb.length} rows`);
  for (const r of bb) {
    await sql`INSERT INTO bank_balances (id, account_id, balance, date, note)
      VALUES (${r.id}, ${r.account_id}, ${r.balance}, ${r.date}, ${r.note ?? ''})
      ON CONFLICT DO NOTHING`;
  }
  if (bb.length) await sql`SELECT setval('bank_balances_id_seq', ${Math.max(...bb.map(r => r.id))})`;

  // 5. snapshots
  const snapshots = fromSQLite('SELECT * FROM snapshots');
  console.log(`snapshots: ${snapshots.length} rows`);
  for (const r of snapshots) {
    await sql`INSERT INTO snapshots (id, total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date)
      VALUES (${r.id}, ${r.total_krw}, ${r.total_usd}, ${r.stock_krw}, ${r.bank_krw}, ${r.exchange_rate}, ${r.date})
      ON CONFLICT (date) DO NOTHING`;
  }
  if (snapshots.length) await sql`SELECT setval('snapshots_id_seq', ${Math.max(...snapshots.map(r => r.id))})`;

  // 6. exchange_rates
  const er = fromSQLite('SELECT * FROM exchange_rates');
  console.log(`exchange_rates: ${er.length} rows`);
  for (const r of er) {
    await sql`INSERT INTO exchange_rates (id, rate, date)
      VALUES (${r.id}, ${r.rate}, ${r.date})
      ON CONFLICT (date) DO NOTHING`;
  }
  if (er.length) await sql`SELECT setval('exchange_rates_id_seq', ${Math.max(...er.map(r => r.id))})`;

  // 7. diary
  const diary = fromSQLite('SELECT * FROM diary');
  console.log(`diary: ${diary.length} rows`);
  for (const r of diary) {
    await sql`INSERT INTO diary (id, title, content, date, mood, tags, created_at, updated_at)
      VALUES (${r.id}, ${r.title}, ${r.content ?? ''}, ${r.date}, ${r.mood ?? 'neutral'}, ${r.tags ?? ''}, ${r.created_at ?? ''}, ${r.updated_at ?? ''})
      ON CONFLICT DO NOTHING`;
  }
  if (diary.length) await sql`SELECT setval('diary_id_seq', ${Math.max(...diary.map(r => r.id))})`;

  // 8. stock_metadata
  const sm = fromSQLite('SELECT * FROM stock_metadata');
  console.log(`stock_metadata: ${sm.length} rows`);
  for (const r of sm) {
    await sql`INSERT INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
      VALUES (${r.ticker}, ${r.sector ?? ''}, ${r.annual_dividend ?? 0}, ${r.dividend_yield ?? 0}, ${r.updated_at ?? null})
      ON CONFLICT (ticker) DO NOTHING`;
  }

  // 9. price_history
  const ph = fromSQLite('SELECT * FROM price_history');
  console.log(`price_history: ${ph.length} rows`);
  for (const r of ph) {
    await sql`INSERT INTO price_history (id, ticker, price, change_pct, date)
      VALUES (${r.id}, ${r.ticker}, ${r.price}, ${r.change_pct ?? 0}, ${r.date})
      ON CONFLICT (ticker, date) DO NOTHING`;
  }
  if (ph.length) await sql`SELECT setval('price_history_id_seq', ${Math.max(...ph.map(r => r.id))})`;

  // 10. benchmark_prices (23k rows — insert one by one)
  const bp = fromSQLite('SELECT * FROM benchmark_prices');
  console.log(`benchmark_prices: ${bp.length} rows (this may take a while...)`);
  for (let i = 0; i < bp.length; i++) {
    const r = bp[i];
    await sql`INSERT INTO benchmark_prices (symbol, date, close)
      VALUES (${r.symbol}, ${r.date}, ${r.close})
      ON CONFLICT (symbol, date) DO NOTHING`;
    if ((i + 1) % 500 === 0) process.stdout.write(`\r  ${i + 1}/${bp.length}`);
  }
  console.log(`\r  ${bp.length}/${bp.length} done`);

  // 11. broker_credentials
  const bc = fromSQLite('SELECT * FROM broker_credentials');
  console.log(`broker_credentials: ${bc.length} rows`);
  for (const r of bc) {
    await sql`INSERT INTO broker_credentials (id, account_id, broker, app_key, secret_key, account_number, last_synced_at)
      VALUES (${r.id}, ${r.account_id}, ${r.broker ?? 'kiwoom'}, ${r.app_key}, ${r.secret_key}, ${r.account_number}, ${r.last_synced_at ?? null})
      ON CONFLICT (account_id) DO NOTHING`;
  }
  if (bc.length) await sql`SELECT setval('broker_credentials_id_seq', ${Math.max(...bc.map(r => r.id))})`;

  // 12. dividend_schedule
  const ds = fromSQLite('SELECT * FROM dividend_schedule');
  console.log(`dividend_schedule: ${ds.length} rows`);
  for (const r of ds) {
    await sql`INSERT INTO dividend_schedule (ticker, ex_dividend_date, dividend_frequency, per_share_amount, updated_at)
      VALUES (${r.ticker}, ${r.ex_dividend_date ?? null}, ${r.dividend_frequency ?? 'annual'}, ${r.per_share_amount ?? 0}, ${r.updated_at ?? null})
      ON CONFLICT (ticker) DO NOTHING`;
  }

  console.log('\n✅ Migration complete!\n');

  // Verify row counts
  const tables = ['users','accounts','holdings','snapshots','exchange_rates','stock_metadata','price_history','benchmark_prices'];
  for (const t of tables) {
    const rows = await sql`SELECT count(*) as n FROM ${sql(t)}`;
    console.log(`  ${t}: ${rows[0].n} rows`);
  }
}

migrate().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
