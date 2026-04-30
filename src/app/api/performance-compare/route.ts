import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { subMonths, subDays } from "date-fns";
import { todayPST, formatPST } from "@/lib/tz";
import { decryptAccountName } from "@/lib/account-crypto";
import type { PerformancePoint, PerformanceCompareResponse } from "@/types";

const BENCHMARK_SYMBOLS: Record<string, string> = {
  KOSPI: "^KS11",
  "S&P500": "^GSPC",
  NASDAQ100: "^NDX",
  NASDAQ: "^IXIC",
};

function getPeriodDates(period: string): { start: string; end: string } {
  const end = todayPST();
  let start: string;
  switch (period) {
    case "1M": start = formatPST(subMonths(new Date(), 1)); break;
    case "3M": start = formatPST(subMonths(new Date(), 3)); break;
    case "6M": start = formatPST(subMonths(new Date(), 6)); break;
    case "1Y": start = formatPST(subMonths(new Date(), 12)); break;
    default:   start = formatPST(subMonths(new Date(), 3));
  }
  return { start, end };
}

/** 0-based normalization (기존 방식) — 벤치마크용 */
function normalizeToReturnPct(pts: { date: string; value: number }[]): PerformancePoint[] {
  if (pts.length === 0) return [];
  const base = pts[0].value;
  if (!base) return [];
  return pts.map((p) => ({
    date: p.date,
    return_pct: ((p.value - base) / base) * 100,
  }));
}

/** 원가 기준 손익% — 계좌/종목/포트폴리오용 */
function normalizeToCostBasis(
  pts: { date: string; value: number }[],
  costBasis: number
): PerformancePoint[] {
  if (pts.length === 0 || costBasis <= 0) return normalizeToReturnPct(pts);
  return pts.map((p) => ({
    date: p.date,
    return_pct: ((p.value - costBasis) / costBasis) * 100,
  }));
}

/**
 * 벤치마크를 subject의 기간 시작 손익%로 shift
 * → 벤치마크가 subject 출발점과 같은 위치에서 시작
 */
function shiftBenchmark(
  benchmarkPts: PerformancePoint[],
  subjectStartPct: number
): PerformancePoint[] {
  return benchmarkPts.map((p) => ({
    date: p.date,
    return_pct: p.return_pct + subjectStartPct,
  }));
}

async function fetchAndCacheBenchmark(
  symbol: string,
  start: string,
  end: string
): Promise<{ date: string; close: number }[]> {
  const sql = getDb();
  const yesterday = formatPST(subDays(new Date(), 1));

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
      for (const p of fresh) {
        await sql`
          INSERT INTO benchmark_prices (symbol, date, close) VALUES (${symbol}, ${p.date}, ${p.close})
          ON CONFLICT (symbol, date) DO NOTHING
        `;
      }
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
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "portfolio";
  const id = searchParams.get("id");
  const period = searchParams.get("period") ?? "3M";
  const benchmarkNames = searchParams.getAll("benchmarks");

  const { start, end } = getPeriodDates(period);
  const sql = getDb();

  let subjectName = "포트폴리오";
  let subjectPoints: PerformancePoint[] = [];

  if (type === "portfolio") {
    // 포트폴리오 전체 원가
    const costRows = await sql`
      SELECT SUM(h.quantity * h.avg_cost *
        CASE WHEN h.currency = 'USD'
          THEN COALESCE((SELECT er.rate FROM exchange_rates er ORDER BY er.date DESC LIMIT 1), 1350)
          ELSE 1
        END
      ) AS cost_basis
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker != 'CASH' AND a.user_id = ${user.id}
    ` as { cost_basis: number | null }[];
    const costBasis = Number(costRows[0]?.cost_basis ?? 0);

    const snapshots = await sql`
      SELECT date, total_krw as value FROM snapshots
      WHERE date >= ${start} AND date <= ${end} AND user_id = ${user.id}
      ORDER BY date
    ` as { date: string; value: number }[];

    subjectPoints = normalizeToCostBasis(snapshots, costBasis);
    subjectName = "포트폴리오";

  } else if (type === "account" && id) {
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name_enc TEXT`.catch(() => {});
    const [account] = await sql`
      SELECT name, name_enc FROM accounts WHERE id = ${Number(id)} AND user_id = ${user.id}
    ` as { name: string | null; name_enc: string | null }[];
    subjectName = decryptAccountName(account) || "계좌";

    // 계좌 원가 (현재 환율 기준)
    const costRows = await sql`
      SELECT SUM(h.quantity * h.avg_cost *
        CASE WHEN h.currency = 'USD'
          THEN COALESCE((SELECT er.rate FROM exchange_rates er ORDER BY er.date DESC LIMIT 1), 1350)
          ELSE 1
        END
      ) AS cost_basis
      FROM holdings h
      WHERE h.account_id = ${Number(id)}
        AND h.ticker != 'CASH'
    ` as { cost_basis: number | null }[];
    const costBasis = Number(costRows[0]?.cost_basis ?? 0);

    const rows = await sql`
      SELECT ph.date,
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
      WHERE h.account_id = ${Number(id)}
        AND ph.date >= ${start}
        AND ph.date <= ${end}
        AND h.ticker != 'CASH'
      GROUP BY ph.date
      ORDER BY ph.date
    ` as { date: string; value: number }[];

    subjectPoints = normalizeToCostBasis(rows, costBasis);

  } else if (type === "stock" && id) {
    // 종목 원가
    const [holding] = await sql`
      SELECT h.name, h.avg_cost, h.currency
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker = ${id} AND a.user_id = ${user.id}
      LIMIT 1
    ` as { name: string; avg_cost: number; currency: string }[];
    subjectName = holding?.name ?? id;

    const rows = await sql`
      SELECT date, price AS value FROM price_history
      WHERE ticker = ${id} AND date >= ${start} AND date <= ${end}
      ORDER BY date
    ` as { date: string; value: number }[];

    if (rows.length === 0) {
      const symbol = BENCHMARK_SYMBOLS[id] ?? id;
      const pts = await fetchAndCacheBenchmark(symbol, start, end);
      // 원가 없으면 0-based
      subjectPoints = normalizeToReturnPct(pts.map((p) => ({ date: p.date, value: p.close })));
    } else if (holding?.avg_cost && holding.avg_cost > 0) {
      // USD 종목이면 원가를 USD 단위 그대로 사용 (같은 단위끼리 비교)
      subjectPoints = normalizeToCostBasis(rows, holding.avg_cost);
    } else {
      subjectPoints = normalizeToReturnPct(rows);
    }
  }

  // Subject의 기간 시작 손익% (벤치마크 shift 기준)
  const subjectStartPct = subjectPoints[0]?.return_pct ?? 0;

  // --- Benchmarks: 0-based normalize → subject 시작점으로 shift ---
  const benchmarkResult: Record<string, PerformancePoint[]> = {};
  for (const name of benchmarkNames) {
    const symbol = BENCHMARK_SYMBOLS[name];
    if (!symbol) continue;
    const pts = await fetchAndCacheBenchmark(symbol, start, end);
    const normalized = normalizeToReturnPct(pts.map((p) => ({ date: p.date, value: p.close })));
    benchmarkResult[name] = shiftBenchmark(normalized, subjectStartPct);
  }

  const response: PerformanceCompareResponse = {
    subject: { name: subjectName, points: subjectPoints },
    benchmarks: benchmarkResult,
  };

  return NextResponse.json(response);
}
