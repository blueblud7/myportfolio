import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { scoreTenBagger, type TenBaggerResult } from "@/lib/ten-bagger-score";
import { ALL_TICKERS, type IndexName } from "@/lib/index-tickers";

export const maxDuration = 300;

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
      early_score     INTEGER  DEFAULT 0,
      phase           TEXT     DEFAULT 'breakout',
      sparkline       JSONB,
      PRIMARY KEY (ticker, index_name, analyzed_date)
    )
  `;
  // 기존 테이블에 컬럼이 없으면 추가
  await sql`ALTER TABLE ten_bagger_cache ADD COLUMN IF NOT EXISTS early_score INTEGER DEFAULT 0`.catch(() => {});
  await sql`ALTER TABLE ten_bagger_cache ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'breakout'`.catch(() => {});
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
      volume_ratio, recovery_pct, score, signals_count,
      early_score, phase, sparkline
    ) VALUES (
      ${ticker}, ${indexName}, ${date}, ${r.name}, ${r.currency}, ${r.price},
      ${r.low52w}, ${r.high52w}, ${r.from52wLow},
      ${r.localMinPrice}, ${r.localMinDate}, ${r.fromLocalMin},
      ${r.volBasePrice}, ${r.volBaseDate}, ${r.fromVolBase},
      ${r.volumeRatio}, ${r.recoveryPct}, ${r.score}, ${r.signalsCount},
      ${r.earlyScore}, ${r.phase}, ${JSON.stringify(r.sparkline)}
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
      early_score     = EXCLUDED.early_score,
      phase           = EXCLUDED.phase,
      sparkline       = EXCLUDED.sparkline
  `;
}

export async function GET(req: NextRequest) {
  const index = (req.nextUrl.searchParams.get("index") ?? "NASDAQ100") as IndexName;
  const force = req.nextUrl.searchParams.get("force") === "true";
  const tickers = ALL_TICKERS[index] ?? [];
  const today = new Date().toISOString().split("T")[0];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      try {
        await ensureTable();
        const cached = force ? new Set<string>() : await getCachedTickers(index, today);
        const remaining = tickers.filter((t) => !cached.has(t));
        const total = tickers.length;
        let analyzed = cached.size;

        send({ type: "start", total, analyzed, remaining: remaining.length });

        if (remaining.length === 0) {
          send({ type: "done", total, analyzed });
          controller.close();
          return;
        }

        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((ticker) => scoreTenBagger(ticker)),
          );

          for (let j = 0; j < batch.length; j++) {
            const ticker = batch[j];
            const r = results[j];
            analyzed++;

            if (r.status === "fulfilled" && r.value) {
              await saveResult(index, today, ticker, r.value);
              send({ type: "progress", analyzed, total, ticker, result: r.value });
            } else {
              send({ type: "progress", analyzed, total, ticker, result: null });
            }
          }

          if (i + BATCH_SIZE < remaining.length) {
            await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
          }
        }

        send({ type: "done", total, analyzed });
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
