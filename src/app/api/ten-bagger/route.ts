import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { IndexName } from "@/lib/index-tickers";

export interface TenBaggerCacheRow {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  low52w: number | null;
  high52w: number | null;
  from52wLow: number | null;
  localMinPrice: number | null;
  localMinDate: string | null;
  fromLocalMin: number | null;
  volBasePrice: number | null;
  volBaseDate: string | null;
  fromVolBase: number | null;
  volumeRatio: number | null;
  recoveryPct: number | null;
  score: number;
  signalsCount: number;
  sparkline: number[];
}

export async function GET(req: NextRequest) {
  const index = (req.nextUrl.searchParams.get("index") ?? "NASDAQ100") as IndexName;
  const minScore = Number(req.nextUrl.searchParams.get("minScore") ?? "0");

  try {
    const sql = getDb();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await sql`
      SELECT ticker, name, currency, price,
             low_52w, high_52w, from_52w_low,
             local_min_price, local_min_date, from_local_min,
             vol_base_price, vol_base_date, from_vol_base,
             volume_ratio, recovery_pct, score, signals_count, sparkline,
             analyzed_date
      FROM ten_bagger_cache
      WHERE index_name = ${index}
        AND score >= ${minScore}
        AND analyzed_date = (
          SELECT MAX(analyzed_date) FROM ten_bagger_cache WHERE index_name = ${index}
        )
      ORDER BY score DESC, from_52w_low DESC NULLS LAST
    `.catch(() => []) as Record<string, unknown>[];

    const date = (rows[0]?.analyzed_date as string) ?? null;

    const results: TenBaggerCacheRow[] = rows.map((r) => ({
      ticker: r.ticker as string,
      name: (r.name as string) ?? (r.ticker as string),
      currency: (r.currency as string) ?? "USD",
      price: Number(r.price),
      low52w: r.low_52w != null ? Number(r.low_52w) : null,
      high52w: r.high_52w != null ? Number(r.high_52w) : null,
      from52wLow: r.from_52w_low != null ? Number(r.from_52w_low) : null,
      localMinPrice: r.local_min_price != null ? Number(r.local_min_price) : null,
      localMinDate: (r.local_min_date as string) ?? null,
      fromLocalMin: r.from_local_min != null ? Number(r.from_local_min) : null,
      volBasePrice: r.vol_base_price != null ? Number(r.vol_base_price) : null,
      volBaseDate: (r.vol_base_date as string) ?? null,
      fromVolBase: r.from_vol_base != null ? Number(r.from_vol_base) : null,
      volumeRatio: r.volume_ratio != null ? Number(r.volume_ratio) : null,
      recoveryPct: r.recovery_pct != null ? Number(r.recovery_pct) : null,
      score: Number(r.score ?? 0),
      signalsCount: Number(r.signals_count ?? 0),
      sparkline:
        r.sparkline == null
          ? []
          : typeof r.sparkline === "string"
            ? JSON.parse(r.sparkline)
            : (r.sparkline as number[]),
    }));

    return NextResponse.json({ results, date, total: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
