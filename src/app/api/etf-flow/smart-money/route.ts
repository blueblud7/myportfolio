import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getDb } from "@/lib/db";
import { isKoreanTicker } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export type SignalType = "선행매수" | "추세확인" | "주의" | "중립";

export interface SmartMoneyStock {
  ticker: string;
  name: string;
  // ETF 자금 집중도
  demandScore: number;
  estimatedInflowKrw: number;   // 추정 ETF 유입금액 (KRW 환산)
  etfCount: number;
  avgHoldingPct: number;
  // 종목 자체 가격
  stockChangePct: number | null;    // 오늘 수익률
  stockWeekChangePct: number | null; // 주간 수익률
  stockPrice: number | null;
  stockCurrency: string;
  // 신호
  signal: SignalType;
  signalScore: number;  // 1~5 (높을수록 강한 매수 신호)
  reason: string;       // 매수 근거 한 줄
  // 유입 ETF 목록
  inflows: { etfName: string; holdingPct: number; volumeRatio: number; inflowKrw: number }[];
}

// 배치로 주가 조회
async function fetchStockPrices(
  tickers: string[]
): Promise<Map<string, { changePct: number; weekChangePct: number | null; price: number; currency: string }>> {
  const map = new Map<string, { changePct: number; weekChangePct: number | null; price: number; currency: string }>();
  const BATCH = 8;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        const symbols = isKoreanTicker(ticker)
          ? [`${ticker}.KS`, `${ticker}.KQ`]
          : [ticker];

        for (const sym of symbols) {
          try {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            const period1 = monthAgo.toISOString().split("T")[0];
            const period2 = new Date().toISOString().split("T")[0];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [quote, chart]: [any, any] = await Promise.all([
              yf.quote(sym),
              yf.chart(sym, { period1, period2, interval: "1wk" }).catch(() => null),
            ]);

            if (!quote?.regularMarketPrice) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const closes: number[] = (chart?.quotes ?? []).filter((q: any) => q.close != null).map((q: any) => q.close);
            const weekChangePct = closes.length >= 2
              ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
              : null;

            map.set(ticker, {
              changePct: Math.round((quote.regularMarketChangePercent ?? 0) * 100) / 100,
              weekChangePct: weekChangePct != null ? Math.round(weekChangePct * 100) / 100 : null,
              price: quote.regularMarketPrice,
              currency: quote.currency ?? (isKoreanTicker(ticker) ? "KRW" : "USD"),
            });
            break;
          } catch { continue; }
        }
      })
    );
    if (i + BATCH < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return map;
}

function classifySignal(
  demandScore: number,
  stockChangePct: number | null,
  stockWeekChangePct: number | null,
  volumeRatioAvg: number,
): { signal: SignalType; signalScore: number; reason: string } {
  const stock1d = stockChangePct ?? 0;
  const stock1w = stockWeekChangePct ?? 0;
  const isInflowStrong = demandScore >= 5 || volumeRatioAvg >= 1.8;
  const isStockLagging = stock1d < 1.0 && stock1w < 3.0;
  const isStockRising = stock1d >= 1.0 || stock1w >= 3.0;
  const isStockFalling = stock1d < -2.0 || stock1w < -5.0;

  if (isInflowStrong && isStockLagging) {
    return {
      signal: "선행매수",
      signalScore: 5,
      reason: `ETF 자금 강하게 유입(수요점수 ${demandScore.toFixed(1)})되는데 주가는 아직 반응 없음 → 선행 매수 기회`,
    };
  }
  if (isInflowStrong && isStockRising) {
    return {
      signal: "추세확인",
      signalScore: 4,
      reason: `ETF 자금 유입 + 주가 상승 동시 진행 → 추세 확인, 눌림목 매수 전략`,
    };
  }
  if (demandScore >= 2 && isStockLagging) {
    return {
      signal: "선행매수",
      signalScore: 3,
      reason: `여러 ETF에서 비중 보유 중이나 주가 지연 → 분할 매수 고려`,
    };
  }
  if (isStockFalling && demandScore < 2) {
    return {
      signal: "주의",
      signalScore: 1,
      reason: `ETF 자금 유입 약하고 주가 하락 중 → 관망 권고`,
    };
  }
  if (isStockRising && demandScore < 1) {
    return {
      signal: "주의",
      signalScore: 2,
      reason: `주가는 오르지만 ETF 자금 뒷받침 약함 → 개인 수급 주도, 주의 필요`,
    };
  }
  return {
    signal: "중립",
    signalScore: 2,
    reason: `ETF 자금 유입 보통, 개별 모멘텀 확인 후 진입 권장`,
  };
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  try {
    const sql = getDb();

    // 오늘 캐시된 ETF 데이터
    const etfRows = await sql`
      SELECT ticker, name, price, volume, avg_volume, volume_ratio, holdings
      FROM etf_cache
      WHERE analyzed_date = ${today} AND holdings IS NOT NULL
    `.catch(() => []) as {
      ticker: string; name: string; price: number;
      volume: number; avg_volume: number; volume_ratio: number;
      holdings: unknown;
    }[];

    if (etfRows.length === 0) {
      return NextResponse.json({ stocks: [], message: "ETF 데이터 없음 — 먼저 ETF 분석을 실행하세요." });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parse = (v: unknown): any[] => v == null ? [] : typeof v === "string" ? JSON.parse(v) : v as any[];

    const allParsed = etfRows.map(r => ({
      ...r,
      holdings: parse(r.holdings),
      volumeRatio: Number(r.volume_ratio),
      price: Number(r.price),
      volume: Number(r.volume),
    }));

    const withHoldings = allParsed.filter(e => e.holdings.length > 0);
    const highVolume = allParsed.filter(e => e.volumeRatio >= 1.2);

    // 자금유입 ETF 필터 (volumeRatio >= 1.2)
    const inflowEtfs = allParsed.filter(e => e.volumeRatio >= 1.2 && e.holdings.length > 0);

    const debug = {
      totalEtfs: etfRows.length,
      etfsWithHoldings: withHoldings.length,
      etfsHighVolume: highVolume.length,
      inflowEtfs: inflowEtfs.length,
    };

    if (inflowEtfs.length === 0) {
      const msg = withHoldings.length === 0
        ? `ETF ${etfRows.length}개 분석됐지만 구성종목 데이터가 없습니다 (Yahoo Finance 한국 ETF 미지원). KRX Open API 연동이 필요합니다.`
        : highVolume.length === 0
          ? `거래량 급증 ETF 없음 — 오늘 거래량이 평균의 1.2배 이상인 ETF가 없습니다 (${etfRows.length}개 중 0개).`
          : `거래량 급증 ETF ${highVolume.length}개 있지만 구성종목 데이터가 없습니다.`;
      return NextResponse.json({ stocks: [], message: msg, debug });
    }

    // 종목별 집계
    type StockAgg = {
      ticker: string; name: string;
      demandScore: number; estimatedInflowKrw: number;
      etfCount: number; totalHoldingPct: number;
      volumeRatioSum: number;
      inflows: SmartMoneyStock["inflows"];
    };
    const stockMap = new Map<string, StockAgg>();

    for (const etf of inflowEtfs) {
      // 추정 유입 금액: 거래량 중 평균 초과분 × 가격 (원)
      const extraVolume = Math.max(0, etf.volume - (Number(etf.avg_volume) || etf.volume));
      const etfInflowKrw = extraVolume * etf.price;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const h of etf.holdings as any[]) {
        if (!h.ticker) continue;
        const contribution = h.pct * etf.volumeRatio;
        const inflowKrw = etfInflowKrw * (h.pct / 100);

        const existing = stockMap.get(h.ticker);
        if (existing) {
          existing.demandScore += contribution;
          existing.estimatedInflowKrw += inflowKrw;
          existing.etfCount += 1;
          existing.totalHoldingPct += h.pct;
          existing.volumeRatioSum += etf.volumeRatio;
          existing.inflows.push({ etfName: etf.name, holdingPct: h.pct, volumeRatio: etf.volumeRatio, inflowKrw });
        } else {
          stockMap.set(h.ticker, {
            ticker: h.ticker, name: h.name ?? h.ticker,
            demandScore: contribution,
            estimatedInflowKrw: inflowKrw,
            etfCount: 1, totalHoldingPct: h.pct,
            volumeRatioSum: etf.volumeRatio,
            inflows: [{ etfName: etf.name, holdingPct: h.pct, volumeRatio: etf.volumeRatio, inflowKrw }],
          });
        }
      }
    }

    // 수요점수 상위 50개 종목만 주가 조회
    const top = Array.from(stockMap.values())
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 50);

    const uniqueTickers = [...new Set(top.map(s => s.ticker))];
    const priceMap = await fetchStockPrices(uniqueTickers);

    const results: SmartMoneyStock[] = top.map(s => {
      const px = priceMap.get(s.ticker);
      const avgVolumeRatio = s.volumeRatioSum / s.etfCount;
      const { signal, signalScore, reason } = classifySignal(
        s.demandScore, px?.changePct ?? null, px?.weekChangePct ?? null, avgVolumeRatio
      );

      return {
        ticker: s.ticker,
        name: s.name,
        demandScore: Math.round(s.demandScore * 100) / 100,
        estimatedInflowKrw: Math.round(s.estimatedInflowKrw),
        etfCount: s.etfCount,
        avgHoldingPct: Math.round(s.totalHoldingPct / s.etfCount * 10) / 10,
        stockChangePct: px?.changePct ?? null,
        stockWeekChangePct: px?.weekChangePct ?? null,
        stockPrice: px?.price ?? null,
        stockCurrency: px?.currency ?? "KRW",
        signal,
        signalScore,
        reason,
        inflows: s.inflows.sort((a, b) => b.inflowKrw - a.inflowKrw),
      };
    }).sort((a, b) => b.signalScore !== a.signalScore ? b.signalScore - a.signalScore : b.demandScore - a.demandScore);

    return NextResponse.json({ stocks: results, inflowEtfCount: inflowEtfs.length, date: today, debug });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
