import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { todayPST } from "./tz";
import { decryptNum } from "./crypto";
import { decryptHoldingFields } from "./holdings-crypto";

async function initSnapshotColumn(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE snapshots SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
}

export async function createDailySnapshot(userId: number): Promise<boolean> {
  const sql = getDb();
  const today = todayPST();
  await initSnapshotColumn(sql);

  const existing = await sql`SELECT id FROM snapshots WHERE date = ${today} AND user_id = ${userId}`;
  if (existing.length > 0) return false;

  const exchangeRate = await getLatestExchangeRate();

  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});
  const holdingsRaw = await sql`
    SELECT h.ticker, h.currency,
           h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           h.manual_price, h.manual_price_enc,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE a.type = 'stock' AND a.user_id = ${userId}
  ` as { ticker: string; currency: string;
         quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         manual_price: number | null; manual_price_enc: string | null;
         price_market: number }[];

  let stockKrw = 0;
  for (const h of holdingsRaw) {
    const d = decryptHoldingFields(h);
    const qty = d.quantity ?? 0;
    const cost = d.avg_cost ?? 0;
    const manual = d.manual_price;
    const price =
      h.ticker === "CASH" ? cost :
      manual !== null && manual !== undefined && manual > 0 ? manual :
      (h.price_market || cost);
    const value = qty * price;
    stockKrw += h.currency === "USD" ? value * exchangeRate : value;
  }

  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS balance_enc TEXT`.catch(() => {});
  const bankAccounts = await sql`
    SELECT bb.balance, bb.balance_enc, a.currency
    FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE a.type = 'bank' AND a.user_id = ${userId}
      AND bb.date = (SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id)
    GROUP BY bb.account_id, bb.balance, bb.balance_enc, a.currency
  ` as { balance: number | null; balance_enc: string | null; currency: string }[];

  let bankKrw = 0;
  for (const b of bankAccounts) {
    const bal = b.balance_enc !== null ? (decryptNum(b.balance_enc) ?? 0) : (b.balance ?? 0);
    bankKrw += b.currency === "USD" ? bal * exchangeRate : bal;
  }

  const totalKrw = stockKrw + bankKrw;
  const totalUsd = totalKrw / exchangeRate;

  await sql`
    INSERT INTO snapshots (total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date, user_id)
    VALUES (${totalKrw}, ${totalUsd}, ${stockKrw}, ${bankKrw}, ${exchangeRate}, ${today}, ${userId})
    ON CONFLICT DO NOTHING
  `;

  return true;
}

export async function createAccountSnapshots(userId: number): Promise<void> {
  const sql = getDb();
  const today = todayPST();
  const exchangeRate = await getLatestExchangeRate();

  const accounts = await sql`SELECT id, type, currency FROM accounts WHERE user_id = ${userId}` as {
    id: number;
    type: string;
    currency: string;
  }[];

  for (const acct of accounts) {
    let valueKrw = 0;

    if (acct.type === "stock") {
      const holdingsRaw = await sql`
        SELECT h.ticker, h.currency,
               h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
               h.manual_price, h.manual_price_enc,
               COALESCE(p.price, 0) as price_market
        FROM holdings h
        LEFT JOIN price_history p ON h.ticker = p.ticker
          AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
        WHERE h.account_id = ${acct.id}
      ` as { ticker: string; currency: string;
             quantity: number | null; quantity_enc: string | null;
             avg_cost: number | null; avg_cost_enc: string | null;
             manual_price: number | null; manual_price_enc: string | null;
             price_market: number }[];

      for (const h of holdingsRaw) {
        const d = decryptHoldingFields(h);
        const qty = d.quantity ?? 0;
        const cost = d.avg_cost ?? 0;
        const manual = d.manual_price;
        const price =
          h.ticker === "CASH" ? cost :
          manual !== null && manual !== undefined && manual > 0 ? manual :
          (h.price_market || cost);
        const val = qty * price;
        valueKrw += h.currency === "USD" ? val * exchangeRate : val;
      }
    } else {
      const [latest] = await sql`
        SELECT balance, balance_enc FROM bank_balances
        WHERE account_id = ${acct.id}
        ORDER BY date DESC LIMIT 1
      ` as { balance: number | null; balance_enc: string | null }[];
      if (latest) {
        const bal = latest.balance_enc !== null ? (decryptNum(latest.balance_enc) ?? 0) : (latest.balance ?? 0);
        valueKrw = acct.currency === "USD" ? bal * exchangeRate : bal;
      }
    }

    await sql`
      INSERT INTO account_snapshots (account_id, value_krw, date)
      VALUES (${acct.id}, ${valueKrw}, ${today})
      ON CONFLICT (account_id, date) DO UPDATE SET value_krw = EXCLUDED.value_krw
    `;
  }
}

export async function getSnapshots(userId: number, startDate?: string, endDate?: string) {
  const sql = getDb();
  await initSnapshotColumn(sql);

  if (startDate && endDate) {
    return await sql`
      SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date
      FROM snapshots
      WHERE user_id = ${userId} AND date >= ${startDate} AND date <= ${endDate}
      ORDER BY date
    `;
  }

  return await sql`
    SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date
    FROM snapshots WHERE user_id = ${userId} ORDER BY date
  `;
}
