import { NextRequest } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getDb } from "@/lib/db";
import { KR_ETF_LIST, getEtfCategory, type EtfCategory } from "@/lib/etf-kr-tickers";
import { fetchKrxEtfPrices, fetchKrxEtfHoldings, type KrxEtfPrice } from "@/lib/krx-api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 300;
// KRX 전종목 중 거래대금 상위 N개만 분석 (신규 상장 ETF 자동 반영 + 처리량 제한)
const ETF_UNIVERSE_SIZE = 200;

interface EtfUniverseItem {
  ticker: string;
  name: string;
  category: EtfCategory;
}

/**
 * 분석 대상 ETF 유니버스를 구성한다.
 * KRX 시세가 있으면 거래대금 상위 N개(정식 종목명 사용)를, 없으면 시드 목록으로 폴백.
 */
function buildUniverse(krxPrices: Map<string, KrxEtfPrice>): EtfUniverseItem[] {
  if (krxPrices.size > 0) {
    return Array.from(krxPrices.values())
      .sort((a, b) => b.tradingValue - a.tradingValue)
      .slice(0, ETF_UNIVERSE_SIZE)
      .map((k) => ({
        ticker: k.ticker,
        name: k.name || k.ticker,
        category: getEtfCategory(k.ticker),
      }));
  }
  return KR_ETF_LIST.map((e) => ({ ticker: e.ticker, name: e.name, category: e.category }));
}

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
  `.catch(() => []) as { ticker: string }[];
  return new Set(rows.map((r) => r.ticker));
}

// Yahoo Finance는 sparkline + avg volume 전용으로만 사용
async function fetchYahooChartData(ticker: string): Promise<{
  sparkline: number[];
  avgVolume: number;
  weekChangePct: number | null;
  monthChangePct: number | null;
  yahooHoldings: { ticker: string; name: string; pct: number }[];
} | null> {
  const symbol = `${ticker}.KS`;
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const period1 = monthAgo.toISOString().split("T")[0];
  const period2 = new Date().toISOString().split("T")[0];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [holdingsSummary, chart]: [any, any] = await Promise.all([
      yf.quoteSummary(symbol, { modules: ["topHoldings"] }).catch(() => null),
      yf.chart(symbol, { period1, period2, interval: "1d" }).catch(() => null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = chart?.quotes ?? [];
    const sparkline: number[] = quotes
      .filter((q) => q.close != null)
      .map((q) => q.close as number);

    // avg volume 계산 (1달치 거래량 평균)
    const volumes: number[] = quotes
      .filter((q) => q.volume != null && q.volume > 0)
      .map((q) => q.volume as number);
    const avgVolume =
      volumes.length > 0
        ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length)
        : 0;

    const closes = sparkline;
    const weekChangePct =
      closes.length >= 6
        ? ((closes[closes.length - 1] - closes[closes.length - 6]) /
            closes[closes.length - 6]) *
          100
        : null;
    const monthChangePct =
      closes.length >= 2
        ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
        : null;

    // Yahoo 구성종목 (KRX 실패 시 fallback용)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawHoldings: any[] = holdingsSummary?.topHoldings?.holdings ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yahooHoldings = rawHoldings.slice(0, 15).map((h: any) => ({
      ticker: (h.symbol ?? "").replace(/\.(KS|KQ)$/, ""),
      name: h.holdingName ?? h.symbol ?? "",
      pct: Math.round((h.holdingPercent ?? 0) * 10000) / 100,
    })).filter((h: { ticker: string }) => h.ticker);

    return { sparkline, avgVolume, weekChangePct, monthChangePct, yahooHoldings };
  } catch {
    return null;
  }
}

async function buildEtfRecord(
  ticker: string,
  krxData: KrxEtfPrice | undefined,
  chartData: Awaited<ReturnType<typeof fetchYahooChartData>>,
) {
  if (!krxData && !chartData) return null;

  // 가격/거래량: KRX 우선 (더 정확), Yahoo fallback
  const price = krxData?.price ?? 0;
  const changePct = krxData?.changePct ?? 0;
  const volume = krxData?.volume ?? 0;
  const avgVolume = chartData?.avgVolume ?? 0;
  const volumeRatio =
    avgVolume > 0 ? Math.round((volume / avgVolume) * 100) / 100 : 1;

  const sparkline = chartData?.sparkline ?? [];
  const weekChangePct =
    chartData?.weekChangePct != null
      ? Math.round(chartData.weekChangePct * 100) / 100
      : null;
  const monthChangePct =
    chartData?.monthChangePct != null
      ? Math.round(chartData.monthChangePct * 100) / 100
      : null;

  // 구성종목: KRX 우선 (ISIN 있을 때), Yahoo fallback
  let holdings: { ticker: string; name: string; pct: number }[] = [];
  if (krxData?.isinCd) {
    holdings = await fetchKrxEtfHoldings(krxData.isinCd);
  }
  if (holdings.length === 0) {
    holdings = chartData?.yahooHoldings ?? [];
  }

  if (price <= 0 && sparkline.length === 0) return null;

  return {
    price,
    changePct,
    weekChangePct,
    monthChangePct,
    volume,
    avgVolume,
    volumeRatio,
    holdings,
    sparkline,
  };
}

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  const today = new Date().toISOString().split("T")[0];
  const sql = getDb();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* disconnected */ }
      };

      try {
        await ensureTable(sql);
        const cached = forceRefresh ? new Set<string>() : await getCached(sql, today);

        // ── KRX 전종목 시세 1회 bulk 조회 → 유니버스 구성 ───────────────
        send({ type: "info", message: "KRX 시세 로딩 중..." });
        const krxPrices = await fetchKrxEtfPrices();
        const universe = buildUniverse(krxPrices);
        send({
          type: "info",
          message: `KRX ${krxPrices.size}개 ETF 시세 로드 · 분석 대상 ${universe.length}개`,
        });

        const remaining = universe.filter((e) => !cached.has(e.ticker));
        const total = universe.length;
        let analyzed = cached.size;

        send({ type: "start", total, analyzed, remaining: remaining.length });

        if (remaining.length === 0) {
          send({ type: "done", total, analyzed });
          controller.close();
          return;
        }

        // ── 개별 ETF 처리 (Yahoo chart만 호출) ─────────────────────────
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);

          const chartResults = await Promise.allSettled(
            batch.map((e) => fetchYahooChartData(e.ticker)),
          );

          for (let j = 0; j < batch.length; j++) {
            const etf = batch[j];
            const cr = chartResults[j];
            const chartData = cr.status === "fulfilled" ? cr.value : null;
            const krxData = krxPrices.get(etf.ticker);
            analyzed++;

            const d = await buildEtfRecord(etf.ticker, krxData, chartData);

            if (d) {
              const upsert = forceRefresh
                ? sql`ON CONFLICT (ticker, analyzed_date) DO UPDATE SET
                    name=EXCLUDED.name, category=EXCLUDED.category,
                    price=EXCLUDED.price, change_pct=EXCLUDED.change_pct,
                    week_change_pct=EXCLUDED.week_change_pct, month_change_pct=EXCLUDED.month_change_pct,
                    volume=EXCLUDED.volume, avg_volume=EXCLUDED.avg_volume,
                    volume_ratio=EXCLUDED.volume_ratio, holdings=EXCLUDED.holdings,
                    sparkline=EXCLUDED.sparkline`
                : sql`ON CONFLICT (ticker, analyzed_date) DO NOTHING`;

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
                ${upsert}
              `;

              send({
                type: "progress",
                analyzed,
                total,
                item: {
                  ticker: etf.ticker,
                  name: etf.name,
                  category: etf.category,
                  source: krxData ? "krx" : "yahoo",
                  ...d,
                },
              });
            } else {
              send({ type: "progress", analyzed, total, item: null });
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
