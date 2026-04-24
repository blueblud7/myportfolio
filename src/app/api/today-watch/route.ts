import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface EarningsAlert {
  ticker: string;
  name: string;
  earnings_date: string;
  days: number;
  source: "holding" | "watchlist" | "both";
}

export interface TargetReachedAlert {
  ticker: string;
  name: string;
  type: "buy" | "sell";
  target: number;
  current: number;
  gap_pct: number;
  currency: string;
}

export interface DividendAlert {
  ticker: string;
  name: string;
  ex_dividend_date: string;
  days: number;
  per_share_amount: number;
}

export interface TodayWatchResponse {
  earnings: EarningsAlert[];
  targetsReached: TargetReachedAlert[];
  dividends: DividendAlert[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / MS_PER_DAY);
}

export async function GET() {
  const sql = getDb();

  // ── Earnings (D ≤ 7) from holdings ∪ watchlist ───────────────────────────
  const earningsRaw = await sql`
    WITH sources AS (
      SELECT DISTINCT ticker, 'holding'::text AS src FROM holdings WHERE ticker <> 'CASH'
      UNION
      SELECT DISTINCT ticker, 'watchlist'::text AS src FROM watchlist
    ),
    grouped AS (
      SELECT ticker, STRING_AGG(DISTINCT src, ',') AS srcs FROM sources GROUP BY ticker
    )
    SELECT e.ticker, e.name, e.earnings_date, g.srcs
    FROM earnings_calendar e
    JOIN grouped g ON e.ticker = g.ticker
    WHERE e.earnings_date IS NOT NULL
    ORDER BY e.earnings_date ASC
  ` as { ticker: string; name: string; earnings_date: string; srcs: string }[];

  const earnings: EarningsAlert[] = [];
  for (const row of earningsRaw) {
    const days = daysUntil(row.earnings_date);
    if (days === null || days < 0 || days > 7) continue;
    const source: EarningsAlert["source"] =
      row.srcs.includes("holding") && row.srcs.includes("watchlist") ? "both" :
      row.srcs.includes("holding") ? "holding" : "watchlist";
    earnings.push({ ticker: row.ticker, name: row.name, earnings_date: row.earnings_date, days, source });
  }

  // ── Watchlist targets reached ────────────────────────────────────────────
  const watchlistRaw = await sql`
    SELECT
      w.ticker, w.name, w.currency, w.target_buy_price, w.target_sell_price,
      COALESCE(p.price, 0) AS current_price
    FROM watchlist w
    LEFT JOIN price_history p ON w.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = w.ticker)
    WHERE COALESCE(p.price, 0) > 0
      AND (
        (w.target_buy_price IS NOT NULL AND p.price <= w.target_buy_price)
        OR
        (w.target_sell_price IS NOT NULL AND p.price >= w.target_sell_price)
      )
  ` as {
    ticker: string; name: string; currency: string;
    target_buy_price: number | null; target_sell_price: number | null;
    current_price: number;
  }[];

  const targetsReached: TargetReachedAlert[] = [];
  for (const row of watchlistRaw) {
    if (row.target_buy_price !== null && row.current_price <= row.target_buy_price) {
      targetsReached.push({
        ticker: row.ticker, name: row.name,
        type: "buy", target: row.target_buy_price, current: row.current_price,
        gap_pct: ((row.current_price - row.target_buy_price) / row.target_buy_price) * 100,
        currency: row.currency,
      });
    }
    if (row.target_sell_price !== null && row.current_price >= row.target_sell_price) {
      targetsReached.push({
        ticker: row.ticker, name: row.name,
        type: "sell", target: row.target_sell_price, current: row.current_price,
        gap_pct: ((row.current_price - row.target_sell_price) / row.target_sell_price) * 100,
        currency: row.currency,
      });
    }
  }

  // ── Ex-dividend (D ≤ 7) for holdings ─────────────────────────────────────
  const divRaw = await sql`
    SELECT DISTINCT h.ticker, h.name, d.ex_dividend_date, d.per_share_amount
    FROM holdings h
    JOIN dividend_schedule d ON h.ticker = d.ticker
    WHERE h.ticker <> 'CASH' AND d.ex_dividend_date IS NOT NULL
  ` as { ticker: string; name: string; ex_dividend_date: string; per_share_amount: number }[];

  const dividends: DividendAlert[] = [];
  for (const row of divRaw) {
    const days = daysUntil(row.ex_dividend_date);
    if (days === null || days < 0 || days > 7) continue;
    dividends.push({
      ticker: row.ticker, name: row.name,
      ex_dividend_date: row.ex_dividend_date, days,
      per_share_amount: row.per_share_amount,
    });
  }
  dividends.sort((a, b) => a.days - b.days);

  return NextResponse.json({ earnings, targetsReached, dividends } satisfies TodayWatchResponse);
}
