import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { format, subYears, subDays } from "date-fns";
import type { ReturnsCalendarResponse, ReturnsCalendarRow } from "@/types";

async function upsertRows(symbol: string, pts: { date: string; close: number }[]) {
  if (pts.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO benchmark_prices (symbol, date, close) VALUES (?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const p of pts) insert.run(symbol, p.date, p.close);
  });
  tx();
}

async function ensureBenchmarkData(symbol: string, start: string, end: string): Promise<void> {
  const db = getDb();

  // 캐시의 최솟값·최댓값 확인
  const bounds = db
    .prepare(`SELECT MIN(date) as min_date, MAX(date) as max_date FROM benchmark_prices WHERE symbol = ?`)
    .get(symbol) as { min_date: string | null; max_date: string | null };

  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // 과거 방향: 캐시가 없거나 start 이후부터 시작되면 처음부터 재취득
  if (!bounds.min_date || bounds.min_date > start) {
    const fetchEnd = bounds.min_date ?? end; // 이미 있는 구간은 IGNORE로 중복 처리
    const pts = await getBenchmarkHistory(symbol, start, fetchEnd);
    await upsertRows(symbol, pts);
  }

  // 최신 방향: 어제까지 채워져 있지 않으면 갭 취득
  if (!bounds.max_date || bounds.max_date < yesterday) {
    const fetchStart = bounds.max_date ?? start;
    const pts = await getBenchmarkHistory(symbol, fetchStart, end);
    await upsertRows(symbol, pts);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "^GSPC";
  const years = Math.min(Number(searchParams.get("years") ?? 20), 50);

  const start = format(subYears(new Date(), years), "yyyy-MM-dd");
  const end = format(new Date(), "yyyy-MM-dd");
  await ensureBenchmarkData(symbol, start, end);

  const db = getDb();

  const rows = db
    .prepare(
      `SELECT date, close FROM benchmark_prices
       WHERE symbol = ? AND date >= ? AND date <= ?
       ORDER BY date`
    )
    .all(symbol, start, end) as { date: string; close: number }[];

  if (rows.length === 0) {
    const empty: ReturnsCalendarResponse = {
      rows: [],
      average: Array(12).fill(null),
      median: Array(12).fill(null),
      avg_annual: null,
    };
    return NextResponse.json(empty);
  }

  // Group by year-month → pick first/last close
  const monthMap = new Map<string, { first: number; last: number }>();
  for (const row of rows) {
    const ym = row.date.substring(0, 7); // "YYYY-MM"
    const entry = monthMap.get(ym);
    if (!entry) {
      monthMap.set(ym, { first: row.close, last: row.close });
    } else {
      entry.last = row.close;
    }
  }

  // Build year → months map
  const yearMap = new Map<number, (number | null)[]>();
  for (const [ym, { first, last }] of monthMap.entries()) {
    const [yearStr, monthStr] = ym.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1; // 0-indexed
    if (!yearMap.has(year)) {
      yearMap.set(year, Array(12).fill(null));
    }
    const months = yearMap.get(year)!;
    if (first && first !== 0) {
      months[monthIdx] = ((last - first) / first) * 100;
    }
  }

  // Annual returns: first close of year vs last close of year
  const yearAnnualMap = new Map<number, number | null>();
  for (const [year, months] of yearMap.entries()) {
    const ymFirst = `${year}-01`;
    const ymLast = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, "0")}`
    )
      .reverse()
      .find((ym) => monthMap.has(ym));

    const firstEntry = monthMap.get(ymFirst);
    const lastEntry = ymLast ? monthMap.get(ymLast) : undefined;

    if (firstEntry && lastEntry && firstEntry.first) {
      yearAnnualMap.set(year, ((lastEntry.last - firstEntry.first) / firstEntry.first) * 100);
    } else {
      yearAnnualMap.set(year, null);
    }
    months; // eslint suppress
  }

  // Sort years descending
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  const calendarRows: ReturnsCalendarRow[] = sortedYears.map((year) => ({
    year,
    months: yearMap.get(year)!,
    annual: yearAnnualMap.get(year) ?? null,
  }));

  // Compute per-month average and median
  const average: (number | null)[] = [];
  const median: (number | null)[] = [];
  for (let m = 0; m < 12; m++) {
    const vals = calendarRows
      .map((r) => r.months[m])
      .filter((v): v is number => v !== null);
    if (vals.length === 0) {
      average.push(null);
      median.push(null);
    } else {
      average.push(vals.reduce((a, b) => a + b, 0) / vals.length);
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median.push(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
    }
  }

  const annualVals = calendarRows
    .map((r) => r.annual)
    .filter((v): v is number => v !== null);
  const avg_annual =
    annualVals.length > 0
      ? annualVals.reduce((a, b) => a + b, 0) / annualVals.length
      : null;

  const response: ReturnsCalendarResponse = {
    rows: calendarRows,
    average,
    median,
    avg_annual,
  };

  return NextResponse.json(response);
}
