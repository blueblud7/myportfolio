import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { format, subDays } from "date-fns";

const BENCHMARK_SYMBOLS: Record<string, string> = {
  KOSPI: "^KS11",
  "S&P500": "^GSPC",
  NASDAQ: "^IXIC",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const end = endParam ?? format(new Date(), "yyyy-MM-dd");
  const start = startParam ?? format(subDays(new Date(), 90), "yyyy-MM-dd");

  const db = getDb();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const result: Record<string, { date: string; close: number }[]> = {};

  for (const [name, symbol] of Object.entries(BENCHMARK_SYMBOLS)) {
    // Check what we have cached
    const cached = db
      .prepare(
        `SELECT date, close FROM benchmark_prices
         WHERE symbol = ? AND date >= ? AND date <= ?
         ORDER BY date`
      )
      .all(symbol, start, end) as { date: string; close: number }[];

    const latestCached = cached.length > 0 ? cached[cached.length - 1].date : null;

    // Fetch gap if needed (latest cached is older than yesterday)
    if (!latestCached || latestCached < yesterday) {
      const fetchStart = latestCached
        ? format(subDays(new Date(latestCached), 0), "yyyy-MM-dd")
        : start;

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

      // Re-query after insert
      const updated = db
        .prepare(
          `SELECT date, close FROM benchmark_prices
           WHERE symbol = ? AND date >= ? AND date <= ?
           ORDER BY date`
        )
        .all(symbol, start, end) as { date: string; close: number }[];

      result[name] = updated;
    } else {
      result[name] = cached;
    }
  }

  return NextResponse.json(result);
}
