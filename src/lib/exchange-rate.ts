import { getDb } from "./db";
import { getExchangeRate as fetchExchangeRate } from "./yahoo-finance";
import { format } from "date-fns";

export async function getLatestExchangeRate(): Promise<number> {
  const sql = getDb();
  const today = format(new Date(), "yyyy-MM-dd");

  const rows = await sql`SELECT rate FROM exchange_rates WHERE date = ${today}`;
  if (rows.length > 0) return (rows[0] as { rate: number }).rate;

  const rate = await fetchExchangeRate();

  await sql`INSERT INTO exchange_rates (rate, date) VALUES (${rate}, ${today})
            ON CONFLICT (date) DO UPDATE SET rate = ${rate}`;

  return rate;
}

export async function getCachedExchangeRate(): Promise<number> {
  const sql = getDb();
  const rows = await sql`SELECT rate FROM exchange_rates ORDER BY date DESC LIMIT 1`;
  return rows.length > 0 ? (rows[0] as { rate: number }).rate : 1350;
}
