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
  const end = searchParams.get("end") ?? format(new Date(), "yyyy-MM-dd");
  const start = searchParams.get("start") ?? format(subDays(new Date(), 90), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const sql = getDb();
  const result: Record<string, { date: string; close: number }[]> = {};

  for (const [name, symbol] of Object.entries(BENCHMARK_SYMBOLS)) {
    const cached = await sql`
      SELECT date, close FROM benchmark_prices
      WHERE symbol=${symbol} AND date>=${start} AND date<=${end} ORDER BY date
    ` as { date: string; close: number }[];

    const latestCached = cached.length > 0 ? cached[cached.length - 1].date : null;
    if (!latestCached || latestCached < yesterday) {
      const fetchStart = latestCached ?? start;
      const fresh = await getBenchmarkHistory(symbol, fetchStart, end);
      for (const point of fresh) {
        await sql`INSERT INTO benchmark_prices (symbol, date, close) VALUES (${symbol}, ${point.date}, ${point.close}) ON CONFLICT (symbol, date) DO NOTHING`;
      }
      const updated = await sql`
        SELECT date, close FROM benchmark_prices
        WHERE symbol=${symbol} AND date>=${start} AND date<=${end} ORDER BY date
      ` as { date: string; close: number }[];
      result[name] = updated;
    } else {
      result[name] = cached;
    }
  }
  return NextResponse.json(result);
}
