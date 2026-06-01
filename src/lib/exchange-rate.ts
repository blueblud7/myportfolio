import { getDb } from "./db";
import { getExchangeRate as fetchExchangeRate } from "./yahoo-finance";
import { todayKST } from "./tz";

/** 장중에도 최신 환율을 반영하기 위한 캐시 신선도(ms). 이보다 오래되면 재조회. */
const FRESH_WINDOW_MS = 30 * 60 * 1000; // 30분

/**
 * 현재 환율을 반환합니다. 한국시간(KST) 기준 "오늘" 행을 사용하되,
 * 마지막 조회가 30분을 넘었으면 외부 API에서 새로 가져와 갱신합니다.
 * (장중 변동을 30분 단위로 반영 — 사용자 조회 시점에 pull)
 */
export async function getLatestExchangeRate(): Promise<number> {
  const sql = getDb();
  const today = todayKST();

  const rows = (await sql`
    SELECT rate, fetched_at FROM exchange_rates WHERE date = ${today}
  `) as { rate: number; fetched_at: string | Date }[];

  if (rows.length > 0) {
    const fetchedAt = new Date(rows[0].fetched_at).getTime();
    if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < FRESH_WINDOW_MS) {
      return rows[0].rate;
    }
  }

  // 캐시가 없거나 오래됨 → 새로 조회. 단, 외부 API 실패 시 기존 값으로 폴백.
  let rate: number;
  try {
    rate = await fetchExchangeRate();
  } catch {
    if (rows.length > 0) return rows[0].rate;
    return getCachedExchangeRate();
  }

  await sql`INSERT INTO exchange_rates (rate, date, fetched_at) VALUES (${rate}, ${today}, now())
            ON CONFLICT (date) DO UPDATE SET rate = ${rate}, fetched_at = now()`;

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
  const today = todayKST();
  const rate = await fetchExchangeRate();
  await sql`INSERT INTO exchange_rates (rate, date, fetched_at) VALUES (${rate}, ${today}, now())
            ON CONFLICT (date) DO UPDATE SET rate = ${rate}, fetched_at = now()`;
  return rate;
}
