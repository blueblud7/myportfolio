import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { format, subMonths, subDays } from "date-fns";
import type { PerformancePoint, PerformanceCompareResponse } from "@/types";

const BENCHMARK_SYMBOLS: Record<string, string> = {
  KOSPI: "^KS11",
  "S&P500": "^GSPC",
  NASDAQ100: "^NDX",
  NASDAQ: "^IXIC",
};

function getPeriodDates(period: string): { start: string; end: string } {
  const end = format(new Date(), "yyyy-MM-dd");
  let start: string;
  switch (period) {
    case "1M": start = format(subMonths(new Date(), 1), "yyyy-MM-dd"); break;
    case "3M": start = format(subMonths(new Date(), 3), "yyyy-MM-dd"); break;
    case "6M": start = format(subMonths(new Date(), 6), "yyyy-MM-dd"); break;
    case "1Y": start = format(subMonths(new Date(), 12), "yyyy-MM-dd"); break;
    default:   start = format(subMonths(new Date(), 3), "yyyy-MM-dd");
  }
  return { start, end };
}

function normalizeToReturnPct(pts: { date: string; value: number }[]): PerformancePoint[] {
  if (pts.length === 0) return [];
  const base = pts[0].value;
  if (!base) return [];
  return pts.map((p) => ({
    date: p.date,
    return_pct: ((p.value - base) / base) * 100,
  }));
}

async function fetchAndCacheBenchmark(
  symbol: string,
  start: string,
  end: string
): Promise<{ date: string; close: number }[]> {
  const db = getDb();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const cached = db
    .prepare(
      `SELECT date, close FROM benchmark_prices
       WHERE symbol = ? AND date >= ? AND date <= ?
       ORDER BY date`
    )
    .all(symbol, start, end) as { date: string; close: number }[];

  const latestCached = cached.length > 0 ? cached[cached.length - 1].date : null;

  if (!latestCached || latestCached < yesterday) {
    const fetchStart = latestCached ?? start;
    const fresh = await getBenchmarkHistory(symbol, fetchStart, end);

    if (fresh.length > 0) {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO benchmark_prices (symbol, date, close) VALUES (?, ?, ?)`
      );
      const tx = db.transaction(() => {
        for (const point of fresh) {
          insert.run(symbol, point.date, point.close);
        }
      });
      tx();
    }

    return db
      .prepare(
        `SELECT date, close FROM benchmark_prices
         WHERE symbol = ? AND date >= ? AND date <= ?
         ORDER BY date`
      )
      .all(symbol, start, end) as { date: string; close: number }[];
  }

  return cached;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "portfolio";
  const id = searchParams.get("id");
  const period = searchParams.get("period") ?? "3M";
  const benchmarkNames = searchParams.getAll("benchmarks");

  const { start, end } = getPeriodDates(period);
  const db = getDb();

  // --- Subject ---
  let subjectName = "포트폴리오";
  let subjectPoints: PerformancePoint[] = [];

  if (type === "portfolio") {
    const snapshots = db
      .prepare(
        `SELECT date, total_krw as value FROM snapshots
         WHERE date >= ? AND date <= ?
         ORDER BY date`
      )
      .all(start, end) as { date: string; value: number }[];
    subjectPoints = normalizeToReturnPct(snapshots);
    subjectName = "포트폴리오";
  } else if (type === "account" && id) {
    const account = db
      .prepare(`SELECT name FROM accounts WHERE id = ?`)
      .get(Number(id)) as { name: string } | undefined;
    subjectName = account?.name ?? "계좌";

    // account daily value: holdings × price_history + bank_balances
    // Use a simpler approach: join holdings with price_history
    const rows = db
      .prepare(
        `SELECT ph.date,
                SUM(
                  CASE
                    WHEN h.currency = 'USD' THEN
                      h.quantity * ph.price * COALESCE(
                        (SELECT er.rate FROM exchange_rates er WHERE er.date <= ph.date ORDER BY er.date DESC LIMIT 1),
                        1350
                      )
                    ELSE h.quantity * ph.price
                  END
                ) AS value
         FROM holdings h
         JOIN price_history ph ON ph.ticker = h.ticker
         WHERE h.account_id = ?
           AND ph.date >= ?
           AND ph.date <= ?
           AND h.ticker != 'CASH'
         GROUP BY ph.date
         ORDER BY ph.date`
      )
      .all(Number(id), start, end) as { date: string; value: number }[];

    subjectPoints = normalizeToReturnPct(rows);
  } else if (type === "stock" && id) {
    // id is ticker
    const holding = db
      .prepare(`SELECT name, currency FROM holdings WHERE ticker = ? LIMIT 1`)
      .get(id) as { name: string; currency: string } | undefined;
    subjectName = holding?.name ?? id;

    const rows = db
      .prepare(
        `SELECT date, price AS value FROM price_history
         WHERE ticker = ? AND date >= ? AND date <= ?
         ORDER BY date`
      )
      .all(id, start, end) as { date: string; value: number }[];

    if (rows.length === 0) {
      // Try from benchmark cache if it's an index
      const symbol = BENCHMARK_SYMBOLS[id] ?? id;
      const pts = await fetchAndCacheBenchmark(symbol, start, end);
      subjectPoints = normalizeToReturnPct(pts.map((p) => ({ date: p.date, value: p.close })));
    } else {
      subjectPoints = normalizeToReturnPct(rows);
    }
  }

  // --- Benchmarks ---
  const benchmarkResult: Record<string, PerformancePoint[]> = {};
  for (const name of benchmarkNames) {
    const symbol = BENCHMARK_SYMBOLS[name];
    if (!symbol) continue;
    const pts = await fetchAndCacheBenchmark(symbol, start, end);
    benchmarkResult[name] = normalizeToReturnPct(pts.map((p) => ({ date: p.date, value: p.close })));
  }

  const response: PerformanceCompareResponse = {
    subject: { name: subjectName, points: subjectPoints },
    benchmarks: benchmarkResult,
  };

  return NextResponse.json(response);
}
