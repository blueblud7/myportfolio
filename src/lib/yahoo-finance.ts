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
  // 현금은 가격 조회 불필요
  if (ticker === "CASH") return null;

  // 한국 종목(숫자로 시작하는 6자리 영숫자)은 .KS → .KQ 순으로 시도
  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yf.quote(`${ticker}${suffix}`);
        if (!result?.regularMarketPrice) continue;

        const name = result.shortName ?? result.longName ?? "";
        // shortName에 ticker가 포함되거나 쉼표가 있으면 잘못된 데이터 → 다음 suffix 시도
        if (!name || name.includes(ticker) || name.includes(",")) continue;

        return {
          ticker,
          price: result.regularMarketPrice,
          changePct: result.regularMarketChangePercent ?? 0,
          currency: result.currency ?? "KRW",
          name,
        };
      } catch {
        // 해당 suffix로 조회 실패 시 다음 시도
      }
    }
    return null;
  }

  // 해외 종목
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

export async function getStockMetadataFromYahoo(ticker: string): Promise<{
  sector: string;
  annual_dividend: number;
  dividend_yield: number;
} | null> {
  if (ticker === "CASH") return null;

  const trySymbol = async (symbol: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await yf.quoteSummary(symbol, {
        modules: ["assetProfile", "summaryDetail"],
      });
      if (!result) return null;
      // 영어 원문 그대로 저장 (화면에서 locale에 맞게 번역)
      const sector: string = result.assetProfile?.sector ?? "";
      const annualDividend: number =
        result.summaryDetail?.trailingAnnualDividendRate ?? 0;
      const dividendYieldRaw: number =
        result.summaryDetail?.dividendYield ?? 0;
      const dividendYield = dividendYieldRaw < 1 ? dividendYieldRaw * 100 : dividendYieldRaw;
      return { sector, annual_dividend: annualDividend, dividend_yield: dividendYield };
    } catch {
      return null;
    }
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const result = await trySymbol(`${ticker}${suffix}`);
      if (result) return result;
    }
    return null;
  }

  const symbol = resolveYahooSymbol(ticker);
  return trySymbol(symbol);
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
