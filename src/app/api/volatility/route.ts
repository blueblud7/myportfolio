import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface VolatilityResult {
  ticker: string;
  name: string;
  // Current HV values
  hv20: number;   // 20-day HV (annualized %)
  hv60: number;   // 60-day HV (annualized %)
  // Rank (min-max normalization over 1yr history)
  hvRank20: number;   // 0-100: where current hv20 sits in the 1yr range
  hvRank60: number;
  // Percentile (what % of days had lower HV)
  hvPct20: number;    // 0-100
  hvPct60: number;
  // Context
  hv20Min: number;
  hv20Max: number;
  hv20Mean: number;
  // Price data
  currentPrice: number;
  changePct: number;
  // Series for sparkline (last 60 data points of hv20)
  hv20Series: { date: string; hv: number }[];
}

/** Annualised historical volatility from an array of close prices */
function rollingHV(closes: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = window; i < closes.length; i++) {
    const slice = closes.slice(i - window, i + 1);
    const logReturns: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      logReturns.push(Math.log(slice[j] / slice[j - 1]));
    }
    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
    result.push(Math.sqrt(variance * 252) * 100); // annualized %
  }
  return result;
}

async function getVolatility(ticker: string): Promise<VolatilityResult | null> {
  if (ticker === "CASH") return null;

  const trySymbol = async (symbol: string): Promise<VolatilityResult | null> => {
    try {
      // Fetch ~1.5 years (to have enough window for 60d HV + 1yr of data)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await yf.chart(symbol, {
        period1: startDate.toISOString().split("T")[0],
        period2: endDate.toISOString().split("T")[0],
        interval: "1d",
      });

      if (!result?.quotes || result.quotes.length < 80) return null;

      const quotes = result.quotes.filter(
        (q: { close: number | null; date: Date }) => q.close != null
      ) as { close: number; date: Date }[];

      if (quotes.length < 80) return null;

      const closes = quotes.map((q) => q.close);
      const dates = quotes.map((q) => q.date.toISOString().split("T")[0]);

      // Calculate rolling HV series
      const hv20Series = rollingHV(closes, 20); // length = closes.length - 20
      const hv60Series = rollingHV(closes, 60); // length = closes.length - 60

      const currentHV20 = hv20Series[hv20Series.length - 1];
      const currentHV60 = hv60Series[hv60Series.length - 1];

      // Use only last 252 trading days of hv20 for rank/percentile
      const recentHV20 = hv20Series.slice(-252);
      const recentHV60 = hv60Series.slice(-252);

      const hv20Min = Math.min(...recentHV20);
      const hv20Max = Math.max(...recentHV20);
      const hv20Mean = recentHV20.reduce((s, v) => s + v, 0) / recentHV20.length;

      const hv60Min = Math.min(...recentHV60);
      const hv60Max = Math.max(...recentHV60);

      const hvRank20 = hv20Max > hv20Min
        ? ((currentHV20 - hv20Min) / (hv20Max - hv20Min)) * 100
        : 50;
      const hvRank60 = hv60Max > hv60Min
        ? ((currentHV60 - hv60Min) / (hv60Max - hv60Min)) * 100
        : 50;

      const hvPct20 = (recentHV20.filter((v) => v < currentHV20).length / recentHV20.length) * 100;
      const hvPct60 = (recentHV60.filter((v) => v < currentHV60).length / recentHV60.length) * 100;

      // Sparkline: last 60 hv20 values with dates
      const sparkStart = hv20Series.length - 60;
      const sparkDates = dates.slice(20 + sparkStart); // offset for the rolling window
      const hv20SparkSeries = hv20Series.slice(-60).map((hv, i) => ({
        date: sparkDates[i] ?? "",
        hv: Math.round(hv * 10) / 10,
      }));

      // Quote for current price
      const currentClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      const changePct = prevClose ? ((currentClose - prevClose) / prevClose) * 100 : 0;

      // Name from quote
      let name = ticker;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = await yf.quote(symbol);
        name = q?.shortName ?? q?.longName ?? ticker;
      } catch {
        // ignore
      }

      return {
        ticker,
        name,
        hv20: Math.round(currentHV20 * 10) / 10,
        hv60: Math.round(currentHV60 * 10) / 10,
        hvRank20: Math.round(hvRank20 * 10) / 10,
        hvRank60: Math.round(hvRank60 * 10) / 10,
        hvPct20: Math.round(hvPct20 * 10) / 10,
        hvPct60: Math.round(hvPct60 * 10) / 10,
        hv20Min: Math.round(hv20Min * 10) / 10,
        hv20Max: Math.round(hv20Max * 10) / 10,
        hv20Mean: Math.round(hv20Mean * 10) / 10,
        currentPrice: currentClose,
        changePct: Math.round(changePct * 100) / 100,
        hv20Series: hv20SparkSeries,
      };
    } catch {
      return null;
    }
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const r = await trySymbol(`${ticker}${suffix}`);
      if (r) return r;
    }
    return null;
  }

  return trySymbol(resolveYahooSymbol(ticker));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "tickers required" }, { status: 400 });
  }

  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);

  // Fetch in parallel (batches of 5 to avoid rate limits)
  const results: VolatilityResult[] = [];
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(getVolatility));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
  });
}
