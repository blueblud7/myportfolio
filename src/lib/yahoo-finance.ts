import { resolveYahooSymbol } from "./ticker-resolver";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

export interface QuoteResult {
  ticker: string;
  price: number;
  changePct: number;
  currency: string;
  name: string;
}

async function fetchYahooChart(
  symbol: string,
  params?: Record<string, string>
): Promise<{ meta: Record<string, unknown>; quotes?: unknown[] } | null> {
  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: YF_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    return { meta: result.meta ?? {}, quotes: result.timestamp ? result.indicators?.quote?.[0] : undefined };
  } catch {
    return null;
  }
}

async function fetchYahooSummary(
  symbol: string,
  modules: string
): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getQuote(ticker: string): Promise<QuoteResult | null> {
  if (ticker === "CASH") return null;

  const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);
  const symbols = isKorean
    ? [`${ticker}.KS`, `${ticker}.KQ`]
    : [resolveYahooSymbol(ticker)];

  for (const symbol of symbols) {
    const data = await fetchYahooChart(symbol);
    if (!data) continue;
    const meta = data.meta;
    const price = meta.regularMarketPrice as number | undefined;
    if (!price) continue;

    // 한국 주식 교차검증: 잘못된 거래소에서 fuzzy match로 MUTUALFUND가 리턴되는 경우 방지
    if (isKorean) {
      const instrumentType = meta.instrumentType as string | undefined;
      const longName = (meta.longName ?? "") as string;
      const shortName = (meta.shortName ?? "") as string;
      // 유효하지 않음: EQUITY/ETF가 아니거나, shortName에 티커/쉼표 포함 (fuzzy match 패턴)
      if (instrumentType && instrumentType !== "EQUITY" && instrumentType !== "ETF") continue;
      if (!longName && (shortName.includes(ticker) || shortName.includes(","))) continue;
    }

    const prevClose = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price) as number;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return {
      ticker,
      price,
      changePct,
      currency: (meta.currency as string) ?? (isKorean ? "KRW" : "USD"),
      name: (meta.longName ?? meta.shortName ?? symbol) as string,
    };
  }

  return null;
}

export async function getQuotes(tickers: string[]): Promise<QuoteResult[]> {
  const results = await Promise.allSettled(tickers.map(getQuote));
  return results
    .filter((r): r is PromiseFulfilledResult<QuoteResult | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r): r is QuoteResult => r !== null);
}

export async function getStockMetadataFromYahoo(ticker: string): Promise<{
  sector: string;
  annual_dividend: number;
  dividend_yield: number;
} | null> {
  if (ticker === "CASH") return null;

  const SECTOR_NORMALIZE: Record<string, string> = {
    Healthcare: "Health Care",
    "Financial Services": "Financials",
  };

  const trySymbol = async (symbol: string) => {
    const result = await fetchYahooSummary(symbol, "assetProfile,summaryDetail");
    if (!result) return null;
    const rawSector = ((result.assetProfile as Record<string, unknown>)?.sector as string) ?? "";
    const sector = SECTOR_NORMALIZE[rawSector] ?? rawSector;
    const summaryDetail = result.summaryDetail as Record<string, unknown> ?? {};
    const annualDividend = (summaryDetail.trailingAnnualDividendRate as number) ?? 0;
    const dividendYieldRaw = (summaryDetail.dividendYield as number) ?? 0;
    const dividendYield = dividendYieldRaw < 1 ? dividendYieldRaw * 100 : dividendYieldRaw;
    return { sector, annual_dividend: annualDividend, dividend_yield: dividendYield };
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const result = await trySymbol(`${ticker}${suffix}`);
      if (result) return result;
    }
    return null;
  }

  return trySymbol(resolveYahooSymbol(ticker));
}

export async function getBenchmarkHistory(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; close: number }[]> {
  try {
    const p1 = Math.floor(new Date(startDate).getTime() / 1000).toString();
    const p2 = Math.floor(new Date(endDate).getTime() / 1000).toString();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.timestamp) return [];
    const timestamps: number[] = result.timestamp;
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().split("T")[0], close: closes[i] }))
      .filter((r): r is { date: string; close: number } => r.close != null);
  } catch (e) {
    console.error(`Failed to get benchmark history for ${symbol}:`, e);
    return [];
  }
}

export async function getDividendCalendarEvents(
  ticker: string
): Promise<{ exDividendDate: string | null; dividendDate: string | null } | null> {
  if (ticker === "CASH") return null;

  const trySymbol = async (symbol: string) => {
    const result = await fetchYahooSummary(symbol, "calendarEvents");
    if (!result?.calendarEvents) return null;
    const cal = result.calendarEvents as Record<string, unknown>;
    const exDate = cal.exDividendDate
      ? new Date(cal.exDividendDate as string).toISOString().split("T")[0]
      : null;
    const divDate = cal.dividendDate
      ? new Date(cal.dividendDate as string).toISOString().split("T")[0]
      : null;
    return { exDividendDate: exDate, dividendDate: divDate };
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const result = await trySymbol(`${ticker}${suffix}`);
      if (result) return result;
    }
    return null;
  }

  return trySymbol(resolveYahooSymbol(ticker));
}

export async function getExchangeRate(): Promise<number> {
  const data = await fetchYahooChart("USDKRW=X");
  return (data?.meta.regularMarketPrice as number) ?? 1350;
}
