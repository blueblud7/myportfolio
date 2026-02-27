import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { format } from "date-fns";

export async function createDailySnapshot(): Promise<boolean> {
  const sql = getDb();
  const today = format(new Date(), "yyyy-MM-dd");

  const existing = await sql`SELECT id FROM snapshots WHERE date = ${today}`;
  if (existing.length > 0) return false;

  const exchangeRate = await getLatestExchangeRate();

  const holdings = await sql`
    SELECT h.ticker, h.quantity, h.currency,
           CASE WHEN h.manual_price IS NOT NULL AND h.manual_price > 0 THEN h.manual_price
                ELSE COALESCE(p.price, h.avg_cost)
           END as current_price
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE a.type = 'stock'
  ` as { ticker: string; quantity: number; currency: string; current_price: number }[];

  let stockKrw = 0;
  for (const h of holdings) {
    const value = h.quantity * h.current_price;
    stockKrw += h.currency === "USD" ? value * exchangeRate : value;
  }

  const bankAccounts = await sql`
    SELECT bb.balance, a.currency
    FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE a.type = 'bank'
      AND bb.date = (SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id)
    GROUP BY bb.account_id, bb.balance, a.currency
  ` as { balance: number; currency: string }[];

  let bankKrw = 0;
  for (const b of bankAccounts) {
    bankKrw += b.currency === "USD" ? b.balance * exchangeRate : b.balance;
  }

  const totalKrw = stockKrw + bankKrw;
  const totalUsd = totalKrw / exchangeRate;

  await sql`
    INSERT INTO snapshots (total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date)
    VALUES (${totalKrw}, ${totalUsd}, ${stockKrw}, ${bankKrw}, ${exchangeRate}, ${today})
    ON CONFLICT (date) DO NOTHING
  `;

  return true;
}

export async function getSnapshots(startDate?: string, endDate?: string) {
  const sql = getDb();

  if (startDate && endDate) {
    return await sql`
      SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date
      FROM snapshots
      WHERE date >= ${startDate} AND date <= ${endDate}
      ORDER BY date
    `;
  }

  return await sql`
    SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date
    FROM snapshots ORDER BY date
  `;
}
