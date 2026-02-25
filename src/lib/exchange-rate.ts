import { getDb } from "./db";
import { getExchangeRate as fetchExchangeRate } from "./yahoo-finance";
import { format } from "date-fns";

export async function getLatestExchangeRate(): Promise<number> {
  const db = getDb();
  const today = format(new Date(), "yyyy-MM-dd");

  const cached = db
    .prepare("SELECT rate FROM exchange_rates WHERE date = ?")
    .get(today) as { rate: number } | undefined;

  if (cached) return cached.rate;

  const rate = await fetchExchangeRate();

  db.prepare(
    "INSERT OR REPLACE INTO exchange_rates (rate, date) VALUES (?, ?)"
  ).run(rate, today);

  return rate;
}

export function getCachedExchangeRate(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT rate FROM exchange_rates ORDER BY date DESC LIMIT 1")
    .get() as { rate: number } | undefined;
  return row?.rate ?? 1350;
}
