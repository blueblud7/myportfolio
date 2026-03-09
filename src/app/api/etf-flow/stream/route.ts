import { NextRequest } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getDb } from "@/lib/db";
import { KR_ETF_LIST } from "@/lib/etf-kr-tickers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 400;

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS etf_cache (
      id SERIAL PRIMARY KEY,
      ticker TEXT NOT NULL,
      name TEXT,
      category TEXT,
      price NUMERIC,
      change_pct NUMERIC,
      week_change_pct NUMERIC,
      month_change_pct NUMERIC,
      volume BIGINT,
      avg_volume BIGINT,
      volume_ratio NUMERIC,
      holdings JSONB,
      sparkline JSONB,
      analyzed_date DATE NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE(ticker, analyzed_date)
    )
  `;
}

async function getCached(sql: ReturnType<typeof getDb>, date: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT ticker FROM etf_cache WHERE analyzed_date = ${date}
  ` as { ticker: string }[];
  return new Set(rows.map(r => r.ticker));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEtfData(ticker: string): Promise<any | null> {
  const symbol = `${ticker}.KS`;
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const period1 = monthAgo.toISOString().split("T")[0];
  const period2 = new Date().toISOString().split("T")[0];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [quote, holdingsSummary, chart]: [any, any, any] = await Promise.all([
      yf.quote(symbol),
      yf.quoteSummary(symbol, { modules: ["topHoldings"] }).catch(() => null),
      yf.chart(symbol, { period1, period2, interval: "1d" }).catch(() => null),
    ]);

    if (!quote?.regularMarketPrice) return null;

    // 스파크라인 (1달 일별)
    const sparkline: number[] = (chart?.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.close != null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => q.close as number);

    // 주간/월간 수익률
    const closes = sparkline;
    const weekChangePct = closes.length >= 5
      ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
      : null;
    const monthChangePct = closes.length >= 2
      ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
      : null;

    // 구성종목 (topHoldings)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawHoldings: any[] = holdingsSummary?.topHoldings?.holdings ?? [];
    const holdings = rawHoldings.slice(0, 15).map((h: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ticker: (h.symbol ?? "").replace(/\.(KS|KQ)$/, ""),
      name: h.holdingName ?? h.symbol ?? "",
      pct: Math.round((h.holdingPercent ?? 0) * 10000) / 100,
    })).filter((h: { ticker: string }) => h.ticker);

    const volume = quote.regularMarketVolume ?? 0;
    const avgVolume = quote.averageDailyVolume10Day ?? quote.averageDailyVolume3Month ?? 0;
    const volumeRatio = avgVolume > 0 ? Math.round((volume / avgVolume) * 100) / 100 : 1;

    return {
      price: quote.regularMarketPrice,
      changePct: Math.round((quote.regularMarketChangePercent ?? 0) * 100) / 100,
      weekChangePct: weekChangePct != null ? Math.round(weekChangePct * 100) / 100 : null,
      monthChangePct: monthChangePct != null ? Math.round(monthChangePct * 100) / 100 : null,
      volume,
      avgVolume,
      volumeRatio,
      holdings,
      sparkline,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  const today = new Date().toISOString().split("T")[0];
  const sql = getDb();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* disconnected */ }
      };

      try {
        await ensureTable(sql);
        const cached = forceRefresh ? new Set<string>() : await getCached(sql, today);
        const remaining = KR_ETF_LIST.filter(e => !cached.has(e.ticker));
        const total = KR_ETF_LIST.length;
        let analyzed = cached.size;

        send({ type: "start", total, analyzed, remaining: remaining.length });

        if (remaining.length === 0) {
          send({ type: "done", total, analyzed });
          controller.close();
          return;
        }

        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map(e => fetchEtfData(e.ticker)));

          for (let j = 0; j < batch.length; j++) {
            const etf = batch[j];
            const r = results[j];
            analyzed++;

            if (r.status === "fulfilled" && r.value) {
              const d = r.value;
              if (forceRefresh) {
                await sql`
                  INSERT INTO etf_cache
                    (ticker, name, category, price, change_pct, week_change_pct, month_change_pct,
                     volume, avg_volume, volume_ratio, holdings, sparkline, analyzed_date)
                  VALUES (
                    ${etf.ticker}, ${etf.name}, ${etf.category},
                    ${d.price}, ${d.changePct}, ${d.weekChangePct}, ${d.monthChangePct},
                    ${d.volume}, ${d.avgVolume}, ${d.volumeRatio},
                    ${JSON.stringify(d.holdings)}, ${JSON.stringify(d.sparkline)}, ${today}
                  )
                  ON CONFLICT (ticker, analyzed_date) DO UPDATE SET
                    price=EXCLUDED.price, change_pct=EXCLUDED.change_pct,
                    week_change_pct=EXCLUDED.week_change_pct, month_change_pct=EXCLUDED.month_change_pct,
                    volume=EXCLUDED.volume, avg_volume=EXCLUDED.avg_volume,
                    volume_ratio=EXCLUDED.volume_ratio, holdings=EXCLUDED.holdings,
                    sparkline=EXCLUDED.sparkline
                `;
              } else {
                await sql`
                  INSERT INTO etf_cache
                    (ticker, name, category, price, change_pct, week_change_pct, month_change_pct,
                     volume, avg_volume, volume_ratio, holdings, sparkline, analyzed_date)
                  VALUES (
                    ${etf.ticker}, ${etf.name}, ${etf.category},
                    ${d.price}, ${d.changePct}, ${d.weekChangePct}, ${d.monthChangePct},
                    ${d.volume}, ${d.avgVolume}, ${d.volumeRatio},
                    ${JSON.stringify(d.holdings)}, ${JSON.stringify(d.sparkline)}, ${today}
                  )
                  ON CONFLICT (ticker, analyzed_date) DO NOTHING
                `;
              }

              send({
                type: "progress", analyzed, total,
                item: { ticker: etf.ticker, name: etf.name, category: etf.category, ...d },
              });
            } else {
              send({ type: "progress", analyzed, total, item: null });
            }
          }

          if (i + BATCH_SIZE < remaining.length) {
            await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
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
