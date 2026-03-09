import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { IndexName } from "@/lib/index-tickers";

export interface CanSlimResult {
  ticker: string;
  name: string;
  currency: string;
  score: number;
  criteria: {
    C: boolean | null;
    A: boolean | null;
    N: boolean | null;
    S: boolean | null;
    L: boolean | null;
    I: boolean | null;
    M: boolean | null;
  };
  price: number;
  change52wPct: number | null;
  sparkline: number[];
}

// GET /api/canslim?index=KOSPI — 오늘 캐시된 결과 반환
export async function GET(req: NextRequest) {
  const index = (req.nextUrl.searchParams.get("index") ?? "KOSPI") as IndexName;
  const today = new Date().toISOString().split("T")[0];

  try {
    const sql = getDb();

    // 테이블 없으면 빈 배열
    const rows = await sql`
      SELECT ticker, name, currency, score, criteria, price, change_52w_pct, sparkline
      FROM canslim_cache
      WHERE index_name = ${index} AND analyzed_date = ${today}
      ORDER BY score DESC, change_52w_pct DESC NULLS LAST
    `.catch(() => []) as {
      ticker: string; name: string; currency: string;
      score: number; criteria: CanSlimResult["criteria"];
      price: number; change_52w_pct: number | null;
      sparkline: number[] | string | null;
    }[];

    const results: CanSlimResult[] = rows.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      currency: r.currency,
      score: r.score,
      criteria: typeof r.criteria === "string" ? JSON.parse(r.criteria) : r.criteria,
      price: Number(r.price),
      change52wPct: r.change_52w_pct != null ? Number(r.change_52w_pct) : null,
      sparkline: r.sparkline == null ? [] : typeof r.sparkline === "string" ? JSON.parse(r.sparkline) : r.sparkline,
    }));

    return NextResponse.json({ results, date: today, total: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
