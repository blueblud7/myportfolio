import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scoreTenBagger, type TenBaggerResult } from "@/lib/ten-bagger-score";
import { ALL_TICKERS, type IndexName } from "@/lib/index-tickers";

export const maxDuration = 300;

const INDICES: IndexName[] = ["NASDAQ100", "SP100", "KOSPI"];
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 400;

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS ten_bagger_cache (
      ticker        TEXT    NOT NULL,
      index_name    TEXT    NOT NULL,
      analyzed_date DATE    NOT NULL,
      name          TEXT,
      currency      TEXT    DEFAULT 'USD',
      price         NUMERIC,
      low_52w       NUMERIC,
      high_52w      NUMERIC,
      from_52w_low  NUMERIC,
      local_min_price NUMERIC,
      local_min_date  TEXT,
      from_local_min  NUMERIC,
      vol_base_price  NUMERIC,
      vol_base_date   TEXT,
      from_vol_base   NUMERIC,
      volume_ratio    NUMERIC,
      recovery_pct    NUMERIC,
      score           NUMERIC  DEFAULT 0,
      signals_count   INTEGER  DEFAULT 0,
      sparkline       JSONB,
      PRIMARY KEY (ticker, index_name, analyzed_date)
    )
  `;
}

async function getCachedTickers(indexName: string, date: string): Promise<Set<string>> {
  const sql = getDb();
  const rows = await sql`
    SELECT ticker FROM ten_bagger_cache
    WHERE index_name = ${indexName} AND analyzed_date = ${date}
  `.catch(() => []) as { ticker: string }[];
  return new Set(rows.map((r) => r.ticker));
}

async function saveResult(
  indexName: string,
  date: string,
  ticker: string,
  r: TenBaggerResult,
) {
  const sql = getDb();
  await sql`
    INSERT INTO ten_bagger_cache (
      ticker, index_name, analyzed_date, name, currency, price,
      low_52w, high_52w, from_52w_low,
      local_min_price, local_min_date, from_local_min,
      vol_base_price, vol_base_date, from_vol_base,
      volume_ratio, recovery_pct, score, signals_count, sparkline
    ) VALUES (
      ${ticker}, ${indexName}, ${date}, ${r.name}, ${r.currency}, ${r.price},
      ${r.low52w}, ${r.high52w}, ${r.from52wLow},
      ${r.localMinPrice}, ${r.localMinDate}, ${r.fromLocalMin},
      ${r.volBasePrice}, ${r.volBaseDate}, ${r.fromVolBase},
      ${r.volumeRatio}, ${r.recoveryPct}, ${r.score}, ${r.signalsCount},
      ${JSON.stringify(r.sparkline)}
    )
    ON CONFLICT (ticker, index_name, analyzed_date) DO UPDATE SET
      name            = EXCLUDED.name,
      currency        = EXCLUDED.currency,
      price           = EXCLUDED.price,
      low_52w         = EXCLUDED.low_52w,
      high_52w        = EXCLUDED.high_52w,
      from_52w_low    = EXCLUDED.from_52w_low,
      local_min_price = EXCLUDED.local_min_price,
      local_min_date  = EXCLUDED.local_min_date,
      from_local_min  = EXCLUDED.from_local_min,
      vol_base_price  = EXCLUDED.vol_base_price,
      vol_base_date   = EXCLUDED.vol_base_date,
      from_vol_base   = EXCLUDED.from_vol_base,
      volume_ratio    = EXCLUDED.volume_ratio,
      recovery_pct    = EXCLUDED.recovery_pct,
      score           = EXCLUDED.score,
      signals_count   = EXCLUDED.signals_count,
      sparkline       = EXCLUDED.sparkline
  `;
}

async function analyzeIndex(
  indexName: IndexName,
  date: string,
): Promise<{ total: number; saved: number; skipped: number; failed: number }> {
  const tickers = ALL_TICKERS[indexName] ?? [];
  const cached = await getCachedTickers(indexName, date);
  const remaining = tickers.filter((t) => !cached.has(t));

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((t) => scoreTenBagger(t)));

    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value) {
        await saveResult(indexName, date, batch[j], r.value);
        saved++;
      } else {
        failed++;
      }
    }

    if (i + BATCH_SIZE < remaining.length) {
      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }
  }

  return {
    total: tickers.length,
    saved,
    skipped: cached.size,
    failed,
  };
}

// GET /api/cron/ten-bagger — Vercel Cron 또는 수동 호출
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    await ensureTable();

    const summary: Record<string, ReturnType<typeof analyzeIndex> extends Promise<infer T> ? T : never> = {};
    for (const idx of INDICES) {
      summary[idx] = await analyzeIndex(idx, today);
    }

    return NextResponse.json({ date: today, summary });
  } catch (e) {
    console.error("[cron/ten-bagger]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
