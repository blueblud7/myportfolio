import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { format } from "date-fns";

export async function createDailySnapshot(): Promise<boolean> {
  const db = getDb();
  const today = format(new Date(), "yyyy-MM-dd");

  const existing = db
    .prepare("SELECT id FROM snapshots WHERE date = ?")
    .get(today);
  if (existing) return false;

  const exchangeRate = await getLatestExchangeRate();

  const holdings = db
    .prepare(
      `SELECT h.ticker, h.quantity, h.currency,
              CASE WHEN h.manual_price IS NOT NULL AND h.manual_price > 0 THEN h.manual_price
                   ELSE COALESCE(p.price, h.avg_cost)
              END as current_price,
              a.type
       FROM holdings h
       JOIN accounts a ON h.account_id = a.id
       LEFT JOIN price_history p ON h.ticker = p.ticker
         AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
       WHERE a.type = 'stock'`
    )
    .all() as {
    ticker: string;
    quantity: number;
    currency: string;
    current_price: number;
    type: string;
  }[];

  let stockKrw = 0;
  for (const h of holdings) {
    const value = h.quantity * h.current_price;
    if (h.currency === "USD") {
      stockKrw += value * exchangeRate;
    } else {
      stockKrw += value;
    }
  }

  const bankAccounts = db
    .prepare(
      `SELECT bb.balance, a.currency
       FROM bank_balances bb
       JOIN accounts a ON bb.account_id = a.id
       WHERE a.type = 'bank'
         AND bb.date = (
           SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id
         )
       GROUP BY bb.account_id`
    )
    .all() as { balance: number; currency: string }[];

  let bankKrw = 0;
  for (const b of bankAccounts) {
    if (b.currency === "USD") {
      bankKrw += b.balance * exchangeRate;
    } else {
      bankKrw += b.balance;
    }
  }

  const totalKrw = stockKrw + bankKrw;
  const totalUsd = totalKrw / exchangeRate;

  db.prepare(
    `INSERT INTO snapshots (total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(totalKrw, totalUsd, stockKrw, bankKrw, exchangeRate, today);

  return true;
}

export function getSnapshots(
  startDate?: string,
  endDate?: string
): { total_krw: number; total_usd: number; stock_krw: number; bank_krw: number; exchange_rate: number; date: string }[] {
  const db = getDb();

  if (startDate && endDate) {
    return db
      .prepare(
        "SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date FROM snapshots WHERE date >= ? AND date <= ? ORDER BY date"
      )
      .all(startDate, endDate) as { total_krw: number; total_usd: number; stock_krw: number; bank_krw: number; exchange_rate: number; date: string }[];
  }

  return db
    .prepare(
      "SELECT total_krw, total_usd, stock_krw, bank_krw, exchange_rate, date FROM snapshots ORDER BY date"
    )
    .all() as { total_krw: number; total_usd: number; stock_krw: number; bank_krw: number; exchange_rate: number; date: string }[];
}
