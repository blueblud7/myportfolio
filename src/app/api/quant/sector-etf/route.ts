import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { format, subMonths, subYears, subDays } from "date-fns";
import type { SectorEtfResponse } from "@/types";

const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLV: "Health Care",
  XLE: "Energy",
  XLI: "Industrials",
  XLY: "Consumer Disc.",
  XLP: "Consumer Staples",
  XLRE: "Real Estate",
  XLU: "Utilities",
  XLB: "Materials",
  XLC: "Communication",
};

function getPeriodDates(period: string): { start: string; end: string } {
  const end = format(new Date(), "yyyy-MM-dd");
  let start: string;
  switch (period) {
    case "1M": start = format(subMonths(new Date(), 1), "yyyy-MM-dd"); break;
    case "3M": start = format(subMonths(new Date(), 3), "yyyy-MM-dd"); break;
    case "6M": start = format(subMonths(new Date(), 6), "yyyy-MM-dd"); break;
    case "1Y": start = format(subYears(new Date(), 1), "yyyy-MM-dd"); break;
    case "3Y": start = format(subYears(new Date(), 3), "yyyy-MM-dd"); break;
    case "5Y": start = format(subYears(new Date(), 5), "yyyy-MM-dd"); break;
    default:   start = format(subMonths(new Date(), 3), "yyyy-MM-dd");
  }
  return { start, end };
}

async function fetchAndCacheBenchmark(
  symbol: string,
  start: string,
  end: string
): Promise<{ date: string; close: number }[]> {
  const sql = getDb();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const cached = await sql`
    SELECT date, close FROM benchmark_prices
    WHERE symbol = ${symbol} AND date >= ${start} AND date <= ${end}
    ORDER BY date
  ` as { date: string; close: number }[];

  const latestCached = cached.length > 0 ? cached[cached.length - 1].date : null;

  if (!latestCached || latestCached < yesterday) {
    const fetchStart = latestCached ?? start;
    const fresh = await getBenchmarkHistory(symbol, fetchStart, end);

    if (fresh.length > 0) {
      await sql.transaction(
        fresh.map(p => sql`
          INSERT INTO benchmark_prices (symbol, date, close) VALUES (${symbol}, ${p.date}, ${p.close})
          ON CONFLICT (symbol, date) DO NOTHING
        `)
      );
    }

    return await sql`
      SELECT date, close FROM benchmark_prices
      WHERE symbol = ${symbol} AND date >= ${start} AND date <= ${end}
      ORDER BY date
    ` as { date: string; close: number }[];
  }

  return cached;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "3M";
  const { start, end } = getPeriodDates(period);

  const result: SectorEtfResponse = {};

  for (const ticker of Object.keys(SECTOR_ETFS)) {
    const pts = await fetchAndCacheBenchmark(ticker, start, end);
    if (pts.length === 0) {
      result[ticker] = [];
      continue;
    }
    const base = pts[0].close;
    result[ticker] = pts.map((p) => ({
      date: p.date,
      return_pct: base ? ((p.close - base) / base) * 100 : 0,
    }));
  }

  return NextResponse.json(result);
}
