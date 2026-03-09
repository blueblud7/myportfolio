import YahooFinance from "yahoo-finance2";
import { isKoreanTicker, resolveYahooSymbol } from "./ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface CanSlimCriteria {
  C: boolean | null;
  A: boolean | null;
  N: boolean | null;
  S: boolean | null;
  L: boolean | null;
  I: boolean | null;
  M: boolean | null;
}

export interface CanSlimResult {
  ticker: string;
  name: string;
  currency: string;
  score: number;
  criteria: CanSlimCriteria;
  price: number;
  change52wPct: number | null;
  sparkline: number[];
}

export async function getMarketUptrend(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy: any = await yf.quote("SPY");
    return (spy?.fiftyDayAverage ?? 0) > 0 && spy.regularMarketPrice > spy.fiftyDayAverage;
  } catch {
    return true;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchYahooData(symbol: string): Promise<{ summary: any; quote: any; sparkline: number[] } | null> {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const period1 = threeMonthsAgo.toISOString().split("T")[0];
    const period2 = new Date().toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [summary, quote, chart]: [any, any, any] = await Promise.all([
      yf.quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "earningsTrend"],
      }),
      yf.quote(symbol),
      yf.chart(symbol, { period1, period2, interval: "1wk" }).catch(() => null),
    ]);
    if (!quote?.regularMarketPrice) return null;

    const sparkline: number[] = (chart?.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.close != null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => q.close as number);

    return { summary, quote, sparkline };
  } catch {
    return null;
  }
}

export async function scoreCanSlim(
  ticker: string,
  marketUptrend: boolean
): Promise<CanSlimResult | null> {
  let data: { summary: any; quote: any; sparkline: number[] } | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (isKoreanTicker(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      data = await fetchYahooData(`${ticker}${suffix}`);
      if (data) break;
    }
  } else {
    data = await fetchYahooData(resolveYahooSymbol(ticker));
  }

  if (!data) return null;

  const { summary, quote, sparkline } = data;
  const fd = summary?.financialData;
  const ks = summary?.defaultKeyStatistics;
  const et = summary?.earningsTrend;

  const name: string = quote.shortName ?? quote.longName ?? ticker;
  const currency: string = quote.currency ?? (isKoreanTicker(ticker) ? "KRW" : "USD");
  const price: number = quote.regularMarketPrice ?? 0;

  // C: 최근 분기 EPS 성장 >= 25%
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentTrend = et?.trend?.find((t: any) => t.period === "0q" || t.period === "+1q");
  const cGrowth = currentTrend?.earningsEstimate?.growth ?? fd?.earningsGrowth ?? null;
  const C = cGrowth !== null ? cGrowth >= 0.25 : null;

  // A: 연간 EPS 성장 >= 25%
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annualTrend = et?.trend?.find((t: any) => t.period === "0y" || t.period === "+1y");
  const aGrowth = annualTrend?.earningsEstimate?.growth ?? null;
  const A = aGrowth !== null ? aGrowth >= 0.25
    : fd?.revenueGrowth != null ? fd.revenueGrowth >= 0.15
    : null;

  // N: 52주 신고가 75% 이상 (강한 상승 추세)
  const high52 = quote.fiftyTwoWeekHigh ?? 0;
  const N = high52 > 0 ? price >= high52 * 0.75 : null;

  // S: 거래량 10일 평균 대비 125% 이상
  const vol = quote.regularMarketVolume ?? 0;
  const avgVol = quote.averageDailyVolume10Day ?? quote.averageDailyVolume3Month ?? 0;
  const S = avgVol > 0 ? vol >= avgVol * 1.25 : null;

  // L: 52주 수익률 +10% 이상
  const change52w: number | null = ks?.["52WeekChange"] ?? null;
  const L = change52w !== null ? change52w >= 0.1 : null;

  // I: 기관 보유 5% 이상
  const instPct: number | null = ks?.heldPercentInstitutions ?? null;
  const I = instPct !== null ? instPct >= 0.05 : null;

  // M: 시장 상승 추세
  const M = marketUptrend;

  const criteria: CanSlimCriteria = { C, A, N, S, L, I, M };
  const score = Object.values(criteria).filter((v) => v === true).length;

  return {
    ticker,
    name,
    currency,
    score,
    criteria,
    price,
    change52wPct: change52w != null ? Math.round(change52w * 1000) / 10 : null,
    sparkline,
  };
}
