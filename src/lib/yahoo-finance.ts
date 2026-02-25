import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol } from "./ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface QuoteResult {
  ticker: string;
  price: number;
  changePct: number;
  currency: string;
  name: string;
}

export async function getQuote(ticker: string): Promise<QuoteResult | null> {
  try {
    const symbol = resolveYahooSymbol(ticker);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.quote(symbol);
    if (!result || !result.regularMarketPrice) return null;
    return {
      ticker,
      price: result.regularMarketPrice,
      changePct: result.regularMarketChangePercent ?? 0,
      currency: result.currency ?? "USD",
      name: result.shortName ?? result.longName ?? ticker,
    };
  } catch (e) {
    console.error(`Failed to get quote for ${ticker}:`, e);
    return null;
  }
}

export async function getQuotes(tickers: string[]): Promise<QuoteResult[]> {
  const results = await Promise.allSettled(tickers.map(getQuote));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<QuoteResult | null> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((r): r is QuoteResult => r !== null);
}

export async function getExchangeRate(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.quote("USDKRW=X");
    return result?.regularMarketPrice ?? 1350;
  } catch {
    return 1350;
  }
}
