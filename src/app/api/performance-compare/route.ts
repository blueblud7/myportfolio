import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { subMonths, subDays } from "date-fns";
import { todayPST, formatPST } from "@/lib/tz";
import { decryptAccountName } from "@/lib/account-crypto";
import { decryptNum } from "@/lib/crypto";
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

  // 환율 한 번만 가져옴
  const [erRow] = await sql`SELECT rate FROM exchange_rates ORDER BY date DESC LIMIT 1` as { rate: number }[];
  const usdRate = erRow?.rate ?? 1350;

  if (type === "portfolio") {
    // 포트폴리오 전체 원가 — 암호화된 quantity/avg_cost는 JS에서 합산
    const rows = await sql`
      SELECT h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc, h.currency
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker != 'CASH' AND a.user_id = ${user.id}
    ` as { quantity: number | null; quantity_enc: string | null; avg_cost: number | null; avg_cost_enc: string | null; currency: string }[];
    let costBasis = 0;
    for (const r of rows) {
      const qty = r.quantity_enc ? (decryptNum(r.quantity_enc) ?? 0) : (r.quantity ?? 0);
      const cost = r.avg_cost_enc ? (decryptNum(r.avg_cost_enc) ?? 0) : (r.avg_cost ?? 0);
      const v = qty * cost;
      costBasis += r.currency === "USD" ? v * usdRate : v;
    }

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
    const acctRows = await sql`
      SELECT h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc, h.currency
      FROM holdings h
      WHERE h.account_id = ${Number(id)} AND h.ticker != 'CASH'
    ` as { quantity: number | null; quantity_enc: string | null; avg_cost: number | null; avg_cost_enc: string | null; currency: string }[];
    let costBasis = 0;
    for (const r of acctRows) {
      const qty = r.quantity_enc ? (decryptNum(r.quantity_enc) ?? 0) : (r.quantity ?? 0);
      const cost = r.avg_cost_enc ? (decryptNum(r.avg_cost_enc) ?? 0) : (r.avg_cost ?? 0);
      const v = qty * cost;
      costBasis += r.currency === "USD" ? v * usdRate : v;
    }

    // 일별 가치 — JS 집계
    const dailyRaw = await sql`
      SELECT ph.date, h.ticker, h.currency, h.quantity, h.quantity_enc, ph.price,
             COALESCE((SELECT er.rate FROM exchange_rates er WHERE er.date <= ph.date ORDER BY er.date DESC LIMIT 1), 1350) AS er
      FROM holdings h
      JOIN price_history ph ON ph.ticker = h.ticker
      WHERE h.account_id = ${Number(id)}
        AND ph.date >= ${start}
        AND ph.date <= ${end}
        AND h.ticker != 'CASH'
    ` as { date: string; ticker: string; currency: string; quantity: number | null; quantity_enc: string | null; price: number; er: number }[];
    const byDate = new Map<string, number>();
    for (const r of dailyRaw) {
      const qty = r.quantity_enc ? (decryptNum(r.quantity_enc) ?? 0) : (r.quantity ?? 0);
      const v = qty * r.price;
      const krw = r.currency === "USD" ? v * r.er : v;
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + krw);
    }
    const rows = Array.from(byDate.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));

    subjectPoints = normalizeToCostBasis(rows, costBasis);

  } else if (type === "stock" && id) {
    // 종목 원가
    const [holding] = await sql`
      SELECT h.name, h.avg_cost, h.avg_cost_enc, h.currency
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker = ${id} AND a.user_id = ${user.id}
      LIMIT 1
    ` as { name: string; avg_cost: number | null; avg_cost_enc: string | null; currency: string }[];
    subjectName = holding?.name ?? id;
    const _avgCost = holding?.avg_cost_enc ? (decryptNum(holding.avg_cost_enc) ?? 0) : (holding?.avg_cost ?? 0);
    void _avgCost; // (이 분기는 변동률만 계산하므로 cost_basis 직접 사용 안 함)

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
