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

async function fetchNaverStock(ticker: string): Promise<QuoteResult | null> {
  try {
    const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(ticker)}/basic`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.code === "StockConflict" || !json?.closePrice) return null;
    const price = parseFloat(String(json.closePrice).replace(/,/g, ""));
    if (!isFinite(price) || price <= 0) return null;
    const changePct = parseFloat(String(json.fluctuationsRatio ?? "0"));
    return {
      ticker,
      price,
      changePct: isFinite(changePct) ? changePct : 0,
      currency: "KRW",
      name: json.stockName ?? ticker,
    };
  } catch {
    return null;
  }
}

export async function getQuote(ticker: string): Promise<QuoteResult | null> {
  if (ticker === "CASH") return null;

  const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);

  // 한국 종목: Naver가 실시간 데이터를 제공 (Yahoo는 장중에도 전일 종가를 캐시)
  if (isKorean) {
    const naver = await fetchNaverStock(ticker);
    if (naver) return naver;
    // Naver 실패 시 Yahoo로 fallback (instrumentType 검증 포함)
    for (const suffix of [".KS", ".KQ"]) {
      const data = await fetchYahooChart(`${ticker}${suffix}`);
      if (!data) continue;
      const meta = data.meta;
      const price = meta.regularMarketPrice as number | undefined;
      if (!price) continue;
      const instrumentType = meta.instrumentType as string | undefined;
      if (instrumentType && instrumentType !== "EQUITY" && instrumentType !== "ETF") continue;
      const prevClose = (meta.chartPreviousClose ?? price) as number;
      const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      return {
        ticker,
        price,
        changePct,
        currency: (meta.currency as string) ?? "KRW",
        name: (meta.longName ?? meta.shortName ?? `${ticker}${suffix}`) as string,
      };
    }
    return null;
  }

  // 해외 종목: Yahoo Finance
  const symbol = resolveYahooSymbol(ticker);
  const data = await fetchYahooChart(symbol);
  if (!data) return null;
  const meta = data.meta;
  const price = meta.regularMarketPrice as number | undefined;
  if (!price) return null;
  const prevClose = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price) as number;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return {
    ticker,
    price,
    changePct,
    currency: (meta.currency as string) ?? "USD",
    name: (meta.longName ?? meta.shortName ?? symbol) as string,
  };
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

export async function getEarningsCalendarEvents(
  ticker: string
): Promise<{ earningsDate: string | null; epsEstimate: number | null } | null> {
  if (ticker === "CASH") return null;

  const trySymbol = async (symbol: string) => {
    const result = await fetchYahooSummary(symbol, "calendarEvents");
    if (!result?.calendarEvents) return null;
    const cal = result.calendarEvents as Record<string, unknown>;
    const earnings = cal.earnings as Record<string, unknown> | undefined;
    if (!earnings) return null;

    let earningsDate: string | null = null;
    const dates = earnings.earningsDate as unknown[] | undefined;
    if (Array.isArray(dates) && dates.length > 0) {
      const first = dates[0];
      if (typeof first === "string") {
        earningsDate = new Date(first).toISOString().split("T")[0];
      } else if (typeof first === "number") {
        // Heuristic: sec vs ms
        const ms = first < 10_000_000_000 ? first * 1000 : first;
        earningsDate = new Date(ms).toISOString().split("T")[0];
      } else if (typeof first === "object" && first !== null) {
        const obj = first as { raw?: number; fmt?: string };
        if (obj.fmt) earningsDate = obj.fmt;
        else if (typeof obj.raw === "number") {
          earningsDate = new Date(obj.raw * 1000).toISOString().split("T")[0];
        }
      }
    }

    let epsEstimate: number | null = null;
    const epsAvg = earnings.earningsAverage;
    if (typeof epsAvg === "number") epsEstimate = epsAvg;
    else if (epsAvg && typeof epsAvg === "object" && "raw" in epsAvg) {
      epsEstimate = (epsAvg as { raw: number }).raw;
    }

    return { earningsDate, epsEstimate };
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const result = await trySymbol(`${ticker}${suffix}`);
      if (result?.earningsDate) return result;
    }
    return null;
  }

  return trySymbol(resolveYahooSymbol(ticker));
}

export interface EarningsQuarter {
  quarter: string;        // e.g. "2025Q4" or raw fmt like "4Q2025"
  date: string | null;    // YYYY-MM-DD
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

export async function getEarningsHistory(ticker: string): Promise<EarningsQuarter[] | null> {
  if (ticker === "CASH") return null;

  const num = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "raw" in v) {
      const r = (v as { raw: unknown }).raw;
      return typeof r === "number" ? r : null;
    }
    return null;
  };

  const trySymbol = async (symbol: string): Promise<EarningsQuarter[] | null> => {
    // 1차: earnings 모듈 (earningsChart.quarterly — 가장 안정적, 인증 불필요)
    const result = await fetchYahooSummary(symbol, "earnings");
    if (!result?.earnings) return null;

    const earnings = result.earnings as {
      earningsChart?: { quarterly?: unknown[] };
    };
    const quarterly = earnings.earningsChart?.quarterly;
    if (!Array.isArray(quarterly) || quarterly.length === 0) return null;

    const parsed = quarterly
      .map((row): EarningsQuarter | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const quarter = typeof r.date === "string" ? r.date : "";
        if (!quarter) return null;

        const actual = num(r.actual);
        const estimate = num(r.estimate);
        const surprisePct =
          actual !== null && estimate !== null && estimate !== 0
            ? ((actual - estimate) / Math.abs(estimate)) * 100
            : null;

        return {
          quarter,         // "1Q2024" 등
          date: null,
          epsActual: actual,
          epsEstimate: estimate,
          surprisePct,
        };
      })
      .filter((q): q is EarningsQuarter => q !== null);

    return parsed.length > 0 ? parsed : null;
  };

  if (/^\d[A-Z0-9]{5}$/i.test(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const result = await trySymbol(`${ticker}${suffix}`);
      if (result && result.length > 0) return result;
    }
    return null;
  }

  return trySymbol(resolveYahooSymbol(ticker));
}

export async function getExchangeRate(): Promise<number> {
  const data = await fetchYahooChart("USDKRW=X");
  return (data?.meta.regularMarketPrice as number) ?? 1350;
}
