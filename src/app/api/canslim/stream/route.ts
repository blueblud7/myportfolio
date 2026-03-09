import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getMarketUptrend, scoreCanSlim } from "@/lib/canslim-score";
import { ALL_TICKERS, IndexName } from "@/lib/index-tickers";

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS canslim_cache (
      id SERIAL PRIMARY KEY,
      ticker TEXT NOT NULL,
      name TEXT,
      currency TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      criteria JSONB,
      price NUMERIC,
      change_52w_pct NUMERIC,
      sparkline JSONB,
      index_name TEXT NOT NULL,
      analyzed_date DATE NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE(ticker, index_name, analyzed_date)
    )
  `;
  // 기존 테이블에 sparkline 컬럼 없으면 추가
  await sql`
    ALTER TABLE canslim_cache ADD COLUMN IF NOT EXISTS sparkline JSONB
  `.catch(() => {});
}

async function getCachedTickers(indexName: string, date: string): Promise<Set<string>> {
  const sql = getDb();
  const rows = await sql`
    SELECT ticker FROM canslim_cache
    WHERE index_name = ${indexName} AND analyzed_date = ${date}
  ` as { ticker: string }[];
  return new Set(rows.map((r) => r.ticker));
}

async function saveResult(indexName: string, date: string, result: Awaited<ReturnType<typeof scoreCanSlim>>, ticker: string) {
  if (!result) return;
  const sql = getDb();
  await sql`
    INSERT INTO canslim_cache (ticker, name, currency, score, criteria, price, change_52w_pct, sparkline, index_name, analyzed_date)
    VALUES (
      ${ticker}, ${result.name}, ${result.currency}, ${result.score},
      ${JSON.stringify(result.criteria)}, ${result.price}, ${result.change52wPct},
      ${JSON.stringify(result.sparkline)},
      ${indexName}, ${date}
    )
    ON CONFLICT (ticker, index_name, analyzed_date) DO UPDATE SET
      name = EXCLUDED.name, currency = EXCLUDED.currency, score = EXCLUDED.score,
      criteria = EXCLUDED.criteria, price = EXCLUDED.price, change_52w_pct = EXCLUDED.change_52w_pct,
      sparkline = EXCLUDED.sparkline
  `;
}

export async function GET(req: NextRequest) {
  const index = (req.nextUrl.searchParams.get("index") ?? "KOSPI") as IndexName;
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
        const cached = await getCachedTickers(index, today);
        const remaining = tickers.filter((t) => !cached.has(t));
        const total = tickers.length;
        let analyzed = cached.size;

        send({ type: "start", total, analyzed, remaining: remaining.length });

        if (remaining.length === 0) {
          send({ type: "done", total, analyzed });
          controller.close();
          return;
        }

        const marketUptrend = await getMarketUptrend();

        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(
            batch.map((ticker) => scoreCanSlim(ticker, marketUptrend))
          );

          for (let j = 0; j < batch.length; j++) {
            const ticker = batch[j];
            const r = results[j];
            analyzed++;

            if (r.status === "fulfilled" && r.value) {
              await saveResult(index, today, r.value, ticker);
              send({
                type: "progress",
                analyzed,
                total,
                result: { ...r.value, ticker },
              });
            } else {
              send({ type: "progress", analyzed, total, result: null });
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
