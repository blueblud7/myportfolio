import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { subMonths, subYears } from "date-fns";
import { formatPST } from "@/lib/tz";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";
import type { RiskMetrics } from "@/types";

const RISK_FREE_RATE = 0.035; // 연 3.5%

function getPeriodStart(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "1M": return formatPST(subMonths(now, 1));
    case "3M": return formatPST(subMonths(now, 3));
    case "6M": return formatPST(subMonths(now, 6));
    case "1Y": return formatPST(subYears(now, 1));
    case "ALL": return null;
    default:   return formatPST(subYears(now, 1));
  }
}

function calcMetrics(rows: { date: string; total_krw: number }[]): RiskMetrics {
  if (rows.length < 2) {
    return {
      period_return: 0,
      volatility: 0,
      mdd: 0,
      sharpe: 0,
      best_day: 0,
      worst_day: 0,
      positive_days_pct: 0,
      data_points: rows.length,
      daily_returns: [],
      drawdown_series: [],
    };
  }

  // 일별 수익률 계산
  const dailyReturns: { date: string; return_pct: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].total_krw;
    const curr = rows[i].total_krw;
    if (prev > 0) {
      dailyReturns.push({
        date: rows[i].date,
        return_pct: ((curr - prev) / prev) * 100,
      });
    }
  }

  if (dailyReturns.length === 0) {
    return {
      period_return: 0,
      volatility: 0,
      mdd: 0,
      sharpe: 0,
      best_day: 0,
      worst_day: 0,
      positive_days_pct: 0,
      data_points: rows.length,
      daily_returns: [],
      drawdown_series: [],
    };
  }

  const returns = dailyReturns.map((d) => d.return_pct);

  // 기간 수익률
  const first = rows[0].total_krw;
  const last = rows[rows.length - 1].total_krw;
  const periodReturn = first > 0 ? ((last - first) / first) * 100 : 0;

  // 변동성 (연환산 표준편차)
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const volatility = dailyStd * Math.sqrt(252);

  // 최대낙폭 (MDD)
  const drawdownSeries: { date: string; drawdown_pct: number }[] = [];
  let peak = rows[0].total_krw;
  let mdd = 0;
  for (const row of rows) {
    if (row.total_krw > peak) peak = row.total_krw;
    const dd = peak > 0 ? ((row.total_krw - peak) / peak) * 100 : 0;
    drawdownSeries.push({ date: row.date, drawdown_pct: dd });
    if (dd < mdd) mdd = dd;
  }

  // 샤프 비율
  // 일별 무위험 수익률로 환산
  const dailyRfr = (RISK_FREE_RATE / 252) * 100;
  const excessReturns = returns.map((r) => r - dailyRfr);
  const excessMean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const sharpe = dailyStd > 0 ? (excessMean / dailyStd) * Math.sqrt(252) : 0;

  const bestDay = Math.max(...returns);
  const worstDay = Math.min(...returns);
  const positiveDays = returns.filter((r) => r > 0).length;
  const positiveDaysPct = (positiveDays / returns.length) * 100;

  return {
    period_return: periodReturn,
    volatility,
    mdd,
    sharpe,
    best_day: bestDay,
    worst_day: worstDay,
    positive_days_pct: positiveDaysPct,
    data_points: rows.length,
    daily_returns: dailyReturns,
    drawdown_series: drawdownSeries,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "1Y";
  const startDate = getPeriodStart(period);
  const sql = getDb();

  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS total_krw_enc TEXT`.catch(() => {});
  const rawRows = startDate
    ? await sql`SELECT date, total_krw, total_krw_enc FROM snapshots WHERE date >= ${startDate} AND user_id = ${user.id} ORDER BY date ASC` as { date: string; total_krw: number | null; total_krw_enc: string | null }[]
    : await sql`SELECT date, total_krw, total_krw_enc FROM snapshots WHERE user_id = ${user.id} ORDER BY date ASC` as { date: string; total_krw: number | null; total_krw_enc: string | null }[];
  const rows = rawRows.map(r => ({
    date: r.date,
    total_krw: r.total_krw_enc ? (decryptNum(r.total_krw_enc) ?? 0) : (r.total_krw ?? 0),
  }));

  const metrics = calcMetrics(rows);
  return NextResponse.json(metrics);
}
