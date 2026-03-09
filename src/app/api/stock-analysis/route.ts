import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { isKoreanTicker } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

function normalize(prices: number[]): number[] {
  const base = prices[0];
  if (base === 0) return prices.map(() => 0);
  return prices.map(p => Math.round(((p - base) / base) * 10000) / 100);
}

function euclideanDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

export interface DrawdownEpisode {
  startDate: string;
  troughDate: string;
  recoveryDate: string | null;
  drawdownPct: number;
  durationDays: number;
  recoveryDays: number | null;
}

export interface RunupEpisode {
  startDate: string;
  peakDate: string;
  endDate: string | null;
  runupPct: number;
  durationDays: number;
  declineDays: number | null;
}

export interface ReturnBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface PatternMatch {
  startDate: string;
  endDate: string;
  similarity: number;
  patternPrices: number[];
  futurePrices: number[];
  futureReturn: number;
  futureDays: number;
}

export interface StockAnalysisResult {
  ticker: string;
  name: string;
  currentPrice: number;
  currency: string;
  // MDD + Runup
  combinedSeries: { date: string; drawdown: number; runup: number }[];
  currentDrawdown: number;
  maxDrawdown: number;
  currentRunup: number;
  maxRunup: number;
  episodes: DrawdownEpisode[];
  runupEpisodes: RunupEpisode[];
  // Distribution
  dailyReturns: number[];
  histogram: ReturnBucket[];
  currentReturnPct: number;
  currentReturnPercentile: number;
  weekReturnPct: number | null;
  weekReturnPercentile: number | null;
  returnStats: { mean: number; std: number; min: number; max: number; positive: number };
  // Pattern
  currentPatternPrices: number[];
  patternDays: number;
  patterns: PatternMatch[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawTicker = (searchParams.get("ticker") ?? "AAPL").toUpperCase();
  const patternDays = Math.min(60, Math.max(5, parseInt(searchParams.get("days") ?? "20")));

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const period1 = twoYearsAgo.toISOString().split("T")[0];
  const period2 = new Date().toISOString().split("T")[0];

  // 한국 티커: .KS/.KQ 병렬 시도 → 데이터 많은 쪽 선택
  const symbols = isKoreanTicker(rawTicker)
    ? [`${rawTicker}.KS`, `${rawTicker}.KQ`]
    : [rawTicker];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attempts = await Promise.allSettled(symbols.map(async sym => {
    const [chart, quote] = await Promise.all([
      yf.chart(sym, { period1, period2, interval: "1d" }),
      yf.quote(sym),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { chart, quote, count: (chart?.quotes as any[])?.filter((q: any) => q.close != null).length ?? 0 };
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartData: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quoteData: any = null;
  let bestCount = 0;
  for (const r of attempts) {
    if (r.status === "fulfilled" && r.value.count > bestCount) {
      chartData = r.value.chart;
      quoteData = r.value.quote;
      bestCount = r.value.count;
    }
  }

  if (!chartData?.quotes?.length || bestCount < 5) {
    return NextResponse.json({ error: "데이터를 찾을 수 없습니다. 티커를 확인해주세요." }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes = (chartData.quotes as any[]).filter((q: any) => q.close != null);
  const prices: number[] = quotes.map((q: any) => q.close as number); // eslint-disable-line @typescript-eslint/no-explicit-any
  const dates: string[] = quotes.map((q: any) => new Date(q.date).toISOString().split("T")[0]); // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── 드로다운 + 런업 동시 계산 ──────────────────────────────
  let peak = prices[0];
  let trough = prices[0];
  let globalMdd = 0;
  let globalRunup = 0;
  const combinedSeries: { date: string; drawdown: number; runup: number }[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (prices[i] > peak) peak = prices[i];
    if (prices[i] < trough) trough = prices[i];
    const dd = ((prices[i] - peak) / peak) * 100;
    const ru = ((prices[i] - trough) / trough) * 100;
    if (dd < globalMdd) globalMdd = dd;
    if (ru > globalRunup) globalRunup = ru;
    combinedSeries.push({
      date: dates[i],
      drawdown: Math.round(dd * 100) / 100,
      runup: Math.round(ru * 100) / 100,
    });
  }
  const currentDrawdown = combinedSeries[combinedSeries.length - 1].drawdown;
  const currentRunup = combinedSeries[combinedSeries.length - 1].runup;

  // ── 드로다운 에피소드 탐지 (≤-5%) ────────────────────────
  const episodes: DrawdownEpisode[] = [];
  {
    let inEp = false, epStart = 0, epTrough = 0;
    let epTroughVal = 0;
    for (let i = 1; i < combinedSeries.length; i++) {
      const dd = combinedSeries[i].drawdown;
      if (!inEp && dd <= -5) {
        inEp = true;
        let pk = i - 1;
        while (pk > 0 && combinedSeries[pk].drawdown < 0) pk--;
        epStart = pk; epTrough = i; epTroughVal = dd;
      } else if (inEp) {
        if (dd < epTroughVal) { epTrough = i; epTroughVal = dd; }
        if (dd >= -0.5) {
          episodes.push({ startDate: dates[epStart], troughDate: dates[epTrough], recoveryDate: dates[i], drawdownPct: Math.round(epTroughVal * 100) / 100, durationDays: epTrough - epStart, recoveryDays: i - epTrough });
          inEp = false;
        }
      }
    }
    if (inEp) episodes.push({ startDate: dates[epStart], troughDate: dates[epTrough], recoveryDate: null, drawdownPct: Math.round(epTroughVal * 100) / 100, durationDays: epTrough - epStart, recoveryDays: null });
  }
  episodes.sort((a, b) => a.drawdownPct - b.drawdownPct);

  // ── 런업 에피소드 탐지 (≥+5%) ────────────────────────────
  const runupEpisodes: RunupEpisode[] = [];
  {
    let inEp = false, epStart = 0, epPeak = 0;
    let epPeakVal = 0;
    for (let i = 1; i < combinedSeries.length; i++) {
      const ru = combinedSeries[i].runup;
      if (!inEp && ru >= 5) {
        inEp = true;
        let tr = i - 1;
        while (tr > 0 && combinedSeries[tr].runup > 0) tr--;
        epStart = tr; epPeak = i; epPeakVal = ru;
      } else if (inEp) {
        if (ru > epPeakVal) { epPeak = i; epPeakVal = ru; }
        if (ru <= 0.5) {
          runupEpisodes.push({ startDate: dates[epStart], peakDate: dates[epPeak], endDate: dates[i], runupPct: Math.round(epPeakVal * 100) / 100, durationDays: epPeak - epStart, declineDays: i - epPeak });
          inEp = false;
        }
      }
    }
    if (inEp) runupEpisodes.push({ startDate: dates[epStart], peakDate: dates[epPeak], endDate: null, runupPct: Math.round(epPeakVal * 100) / 100, durationDays: epPeak - epStart, declineDays: null });
  }
  runupEpisodes.sort((a, b) => b.runupPct - a.runupPct);

  // ── 수익률 분포 ──────────────────────────────────────────
  const dailyReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    dailyReturns.push(Math.round(((prices[i] - prices[i - 1]) / prices[i - 1]) * 10000) / 100);
  }

  const BUCKETS: [number, number, string][] = [
    [-Infinity, -7,   "≤-7%"],
    [-7,        -5,   "-7~-5%"],
    [-5,        -3,   "-5~-3%"],
    [-3,        -2,   "-3~-2%"],
    [-2,        -1,   "-2~-1%"],
    [-1,       -0.5,  "-1~-0.5%"],
    [-0.5,      0,    "-0.5~0%"],
    [0,         0.5,  "0~+0.5%"],
    [0.5,       1,    "+0.5~+1%"],
    [1,         2,    "+1~+2%"],
    [2,         3,    "+2~+3%"],
    [3,         5,    "+3~+5%"],
    [5,         7,    "+5~+7%"],
    [7,   Infinity,   "≥+7%"],
  ];

  const histogram: ReturnBucket[] = BUCKETS.map(([min, max, label]) => {
    const count = dailyReturns.filter(r => r >= min && r < max).length;
    return { label, min, max, count, pct: Math.round((count / dailyReturns.length) * 1000) / 10 };
  });

  const currentReturnPct = dailyReturns[dailyReturns.length - 1] ?? 0;
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const rank = sorted.findIndex(r => r >= currentReturnPct);
  const currentReturnPercentile = Math.round((rank / sorted.length) * 100);

  let weekReturnPct: number | null = null;
  let weekReturnPercentile: number | null = null;
  if (prices.length >= 6) {
    weekReturnPct = Math.round(((prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6]) * 10000) / 100;
    const weeklyReturns: number[] = [];
    for (let i = 5; i < prices.length; i++) weeklyReturns.push(Math.round(((prices[i] - prices[i - 5]) / prices[i - 5]) * 10000) / 100);
    const wSorted = [...weeklyReturns].sort((a, b) => a - b);
    const wRank = wSorted.findIndex(r => r >= weekReturnPct!);
    weekReturnPercentile = Math.round((wRank / wSorted.length) * 100);
  }

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const std = Math.sqrt(dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length);
  const positiveCount = dailyReturns.filter(r => r > 0).length;
  const returnStats = {
    mean: Math.round(mean * 1000) / 1000,
    std: Math.round(std * 1000) / 1000,
    min: Math.round(Math.min(...dailyReturns) * 100) / 100,
    max: Math.round(Math.max(...dailyReturns) * 100) / 100,
    positive: Math.round((positiveCount / dailyReturns.length) * 1000) / 10,
  };

  // ── 유사 패턴 매칭 ───────────────────────────────────────
  const futureLookAhead = 15;
  const currentPatternPrices = normalize(prices.slice(-patternDays));
  const matches: (PatternMatch & { distance: number })[] = [];
  const excludeFrom = prices.length - 60;

  for (let i = patternDays; i < excludeFrom - futureLookAhead; i++) {
    const window = normalize(prices.slice(i - patternDays, i));
    const dist = euclideanDist(currentPatternPrices, window);
    const future = prices.slice(i, i + futureLookAhead);
    const futureReturn = future.length > 1 ? Math.round(((future[future.length - 1] - future[0]) / future[0]) * 10000) / 100 : 0;
    matches.push({ startDate: dates[i - patternDays], endDate: dates[i - 1], similarity: Math.max(0, Math.round((1 - dist / 15) * 1000) / 10), patternPrices: window, futurePrices: normalize(future), futureReturn, futureDays: future.length, distance: dist });
  }

  const topPatterns = matches.sort((a, b) => a.distance - b.distance).slice(0, 5).map(({ distance: _, ...rest }) => rest);

  return NextResponse.json({
    ticker: rawTicker,
    name: quoteData?.shortName ?? quoteData?.longName ?? rawTicker,
    currentPrice: prices[prices.length - 1],
    currency: quoteData?.currency ?? (isKoreanTicker(rawTicker) ? "KRW" : "USD"),
    combinedSeries,
    currentDrawdown,
    maxDrawdown: Math.round(globalMdd * 100) / 100,
    currentRunup,
    maxRunup: Math.round(globalRunup * 100) / 100,
    episodes: episodes.slice(0, 8),
    runupEpisodes: runupEpisodes.slice(0, 8),
    dailyReturns,
    histogram,
    currentReturnPct,
    currentReturnPercentile,
    weekReturnPct,
    weekReturnPercentile,
    returnStats,
    currentPatternPrices,
    patternDays,
    patterns: topPatterns,
  } satisfies StockAnalysisResult);
}
