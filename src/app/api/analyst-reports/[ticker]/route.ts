import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBenchmarkHistory, getQuote } from "@/lib/yahoo-finance";

export const maxDuration = 60;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY!;

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

export interface ReportItem {
  id: number;
  title: string;
  firm: string | null;
  analyst: string | null;
  recommendation: string | null;
  recommendation_normalized: string | null;
  target_price_num: number | null;
  report_date: string;
  report_type: string | null;
  pdf_url: string | null;
  price_at_report: number | null;       // 발행일 종가 (가장 가까운 이전 일자)
  return_since_pct: number | null;      // 발행일 → 현재 수익률 %
  target_upside_at_report_pct: number | null; // 발행일 기준 목표가 upside %
  hit_target_within_12m: boolean | null; // 12개월 내 목표가 도달
  days_to_hit: number | null;            // 도달까지 며칠
}

export interface AnalystReportsTickerResponse {
  ticker: string;
  market: string | null;
  stock_name: string | null;
  current_price: number | null;
  current_price_date: string | null;
  reports: ReportItem[];
  price_history: { date: string; price: number }[];
  firm_summary: { firm: string; count: number; avg_target: number; avg_return_since_pct: number; hit_rate_12m: number | null }[];
  analyst_summary: { analyst: string; firm: string; count: number; avg_target: number; avg_return_since_pct: number; hit_rate_12m: number | null }[];
}

function pickPriceAt(history: { date: string; price: number }[], targetDate: string): number | null {
  // history는 ASC 정렬. targetDate 이전(같은날 포함) 중 가장 큰 날짜
  let best: number | null = null;
  for (const h of history) {
    if (h.date <= targetDate) best = h.price;
    else break;
  }
  return best;
}

function checkHitWithin(
  history: { date: string; price: number }[],
  fromDate: string,
  targetPrice: number,
  monthsWindow: number,
  recommendationType: "above" | "below" = "above"
): { hit: boolean; daysToHit: number | null } {
  const fromTime = new Date(fromDate).getTime();
  const cutoffTime = fromTime + monthsWindow * 30 * 86400000;
  for (const h of history) {
    const t = new Date(h.date).getTime();
    if (t < fromTime) continue;
    if (t > cutoffTime) break;
    if (recommendationType === "above" ? h.price >= targetPrice : h.price <= targetPrice) {
      return { hit: true, daysToHit: Math.round((t - fromTime) / 86400000) };
    }
  }
  return { hit: false, daysToHit: null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // Supabase에서 해당 ticker 리포트 모두
  const reportsUrl = `${SUPABASE_URL}/rest/v1/sent_reports?ticker=eq.${encodeURIComponent(ticker)}&category=eq.${encodeURIComponent("Each Company")}&select=id,title,firm,analyst,recommendation,recommendation_normalized,target_price_num,report_date,report_type,pdf_url,stock_name,market&order=report_date.desc`;
  const r = await fetch(reportsUrl, { headers: SB_HEADERS, next: { revalidate: 300 } });
  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ error: `Supabase: ${t}` }, { status: 500 });
  }
  const reportsRaw = await r.json() as {
    id: number; title: string; firm: string | null; analyst: string | null;
    recommendation: string | null; recommendation_normalized: string | null;
    target_price_num: number | null; report_date: string | null;
    report_type: string | null; pdf_url: string | null;
    stock_name: string | null; market: string | null;
  }[];

  if (reportsRaw.length === 0) {
    return NextResponse.json({
      ticker, market: null, stock_name: null,
      current_price: null, current_price_date: null,
      reports: [], price_history: [],
      firm_summary: [], analyst_summary: [],
    } satisfies AnalystReportsTickerResponse);
  }

  const market = reportsRaw[0].market;
  const stock_name = reportsRaw[0].stock_name;

  // price_history (ASC): 가장 오래된 리포트 이전 ~ 현재
  const sql = getDb();
  const oldestReportDate = reportsRaw.reduce((min, r) => r.report_date && r.report_date < min ? r.report_date : min, reportsRaw[0].report_date ?? "9999-12-31");
  let priceRows = await sql`
    SELECT date, price FROM price_history
    WHERE ticker = ${ticker} AND date >= ${oldestReportDate}
    ORDER BY date ASC
  ` as { date: string; price: number }[];

  // price_history에 데이터 없으면 Yahoo에서 on-demand 가져와 저장
  if (priceRows.length === 0 && ticker) {
    const today = new Date().toISOString().slice(0, 10);
    // 한국 종목은 .KS 또는 .KQ 시도
    const isKorean = /^\d{6}$/.test(ticker);
    const symbolsToTry = isKorean ? [`${ticker}.KS`, `${ticker}.KQ`] : [ticker];
    for (const sym of symbolsToTry) {
      const history = await getBenchmarkHistory(sym, oldestReportDate, today);
      if (history.length > 0) {
        // batch insert (idempotent — 중복 방지를 위한 ON CONFLICT 안 쓰고 바로 INSERT)
        for (const h of history) {
          await sql`
            INSERT INTO price_history (ticker, price, change_pct, date)
            VALUES (${ticker}, ${h.close}, 0, ${h.date})
            ON CONFLICT DO NOTHING
          `.catch(() => {});
        }
        priceRows = history.map(h => ({ date: h.date, price: h.close }));
        break;
      }
    }

    // 그래도 비었으면 최신 시세 한 번만 (현재가 표시용)
    if (priceRows.length === 0) {
      const q = await getQuote(ticker);
      if (q && q.price > 0) {
        priceRows = [{ date: today, price: q.price }];
      }
    }
  }

  const price_history = priceRows.map(p => ({ date: p.date, price: Number(p.price) }));

  const latest = price_history.length > 0 ? price_history[price_history.length - 1] : null;
  const current_price = latest?.price ?? null;
  const current_price_date = latest?.date ?? null;

  // 각 리포트별 메트릭
  const reports: ReportItem[] = reportsRaw.map((r) => {
    const reportDate = r.report_date ?? "";
    const priceAt = reportDate ? pickPriceAt(price_history, reportDate) : null;
    const target = r.target_price_num !== null ? Number(r.target_price_num) : null;
    const isSell = r.recommendation_normalized === "SELL" || r.recommendation_normalized === "REDUCE" || r.recommendation_normalized === "UNDERPERFORM";

    let returnSince: number | null = null;
    if (priceAt && current_price && priceAt > 0) {
      returnSince = ((current_price - priceAt) / priceAt) * 100;
    }

    let upsideAtReport: number | null = null;
    if (priceAt && target && priceAt > 0) {
      upsideAtReport = ((target - priceAt) / priceAt) * 100;
    }

    let hit: { hit: boolean; daysToHit: number | null } = { hit: false, daysToHit: null };
    if (priceAt && target && reportDate) {
      hit = checkHitWithin(price_history, reportDate, target, 12, isSell ? "below" : "above");
    }

    return {
      id: r.id,
      title: r.title,
      firm: r.firm,
      analyst: r.analyst,
      recommendation: r.recommendation,
      recommendation_normalized: r.recommendation_normalized,
      target_price_num: target,
      report_date: reportDate,
      report_type: r.report_type,
      pdf_url: r.pdf_url,
      price_at_report: priceAt,
      return_since_pct: returnSince,
      target_upside_at_report_pct: upsideAtReport,
      hit_target_within_12m: target !== null && priceAt !== null ? hit.hit : null,
      days_to_hit: hit.daysToHit,
    };
  });

  // Firm 집계
  const firmMap = new Map<string, { count: number; targets: number[]; returns: number[]; hits: number; hitTotal: number }>();
  for (const r of reports) {
    if (!r.firm) continue;
    const e = firmMap.get(r.firm) ?? { count: 0, targets: [], returns: [], hits: 0, hitTotal: 0 };
    e.count++;
    if (r.target_price_num !== null) e.targets.push(r.target_price_num);
    if (r.return_since_pct !== null) e.returns.push(r.return_since_pct);
    if (r.hit_target_within_12m !== null) {
      e.hitTotal++;
      if (r.hit_target_within_12m) e.hits++;
    }
    firmMap.set(r.firm, e);
  }
  const firm_summary = Array.from(firmMap.entries())
    .map(([firm, e]) => ({
      firm,
      count: e.count,
      avg_target: e.targets.length > 0 ? e.targets.reduce((a, b) => a + b, 0) / e.targets.length : 0,
      avg_return_since_pct: e.returns.length > 0 ? e.returns.reduce((a, b) => a + b, 0) / e.returns.length : 0,
      hit_rate_12m: e.hitTotal > 0 ? (e.hits / e.hitTotal) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count);

  // Analyst 집계
  const analystMap = new Map<string, { firm: string; count: number; targets: number[]; returns: number[]; hits: number; hitTotal: number }>();
  for (const r of reports) {
    if (!r.analyst) continue;
    const key = `${r.analyst}__${r.firm ?? ""}`;
    const e = analystMap.get(key) ?? { firm: r.firm ?? "", count: 0, targets: [], returns: [], hits: 0, hitTotal: 0 };
    e.count++;
    if (r.target_price_num !== null) e.targets.push(r.target_price_num);
    if (r.return_since_pct !== null) e.returns.push(r.return_since_pct);
    if (r.hit_target_within_12m !== null) {
      e.hitTotal++;
      if (r.hit_target_within_12m) e.hits++;
    }
    analystMap.set(key, e);
  }
  const analyst_summary = Array.from(analystMap.entries())
    .map(([key, e]) => ({
      analyst: key.split("__")[0],
      firm: e.firm,
      count: e.count,
      avg_target: e.targets.length > 0 ? e.targets.reduce((a, b) => a + b, 0) / e.targets.length : 0,
      avg_return_since_pct: e.returns.length > 0 ? e.returns.reduce((a, b) => a + b, 0) / e.returns.length : 0,
      hit_rate_12m: e.hitTotal > 0 ? (e.hits / e.hitTotal) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count);

  const response: AnalystReportsTickerResponse = {
    ticker, market, stock_name,
    current_price, current_price_date,
    reports, price_history,
    firm_summary, analyst_summary,
  };
  return NextResponse.json(response);
}
