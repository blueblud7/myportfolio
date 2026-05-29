import { getDb } from "./db";
import { getExchangeRate as fetchExchangeRate } from "./yahoo-finance";
import { todayPST } from "./tz";

export async function getLatestExchangeRate(): Promise<number> {
  const sql = getDb();
  const today = todayPST();

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

/**
 * 특정 날짜 기준 KRW/USD 환율을 반환합니다.
 * 해당일 이전(<=) 가장 가까운 기록을 우선 사용하고, 없으면 이후(>=) 가장 가까운 기록,
 * 그래도 없으면 최신 캐시(없으면 1350)로 폴백합니다.
 * (USD 거래의 거래 시점 원화 환산에 사용 — 양도세/실현손익 정확도)
 */
export async function getExchangeRateForDate(date: string): Promise<number> {
  const sql = getDb();
  const before = await sql`
    SELECT rate FROM exchange_rates WHERE date <= ${date} ORDER BY date DESC LIMIT 1
  ` as { rate: number }[];
  if (before.length > 0) return before[0].rate;

  const after = await sql`
    SELECT rate FROM exchange_rates WHERE date >= ${date} ORDER BY date ASC LIMIT 1
  ` as { rate: number }[];
  if (after.length > 0) return after[0].rate;

  return getCachedExchangeRate();
}

/** 외부 API에서 강제로 최신 환율을 가져와 DB에 덮어씁니다. */
export async function forceRefreshExchangeRate(): Promise<number> {
  const sql = getDb();
  const today = todayPST();
  const rate = await fetchExchangeRate();
  await sql`INSERT INTO exchange_rates (rate, date) VALUES (${rate}, ${today})
            ON CONFLICT (date) DO UPDATE SET rate = ${rate}`;
  return rate;
}
