import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface FundamentalsResult {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  // Valuation
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  // Growth
  revenueGrowth: number | null; // YoY TTM
  earningsGrowth: number | null; // YoY
  // Margins
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  // EPS
  trailingEps: number | null;
  forwardEps: number | null;
  // Other
  beta: number | null;
  marketCap: number | null;
}

async function getFundamentals(ticker: string): Promise<FundamentalsResult | null> {
  if (ticker === "CASH") return null;

  const trySymbol = async (symbol: string): Promise<FundamentalsResult | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [quoteResult, summaryResult] = await Promise.all([
        yf.quote(symbol) as Promise<any>,
        yf.quoteSummary(symbol, {
          modules: ["financialData", "defaultKeyStatistics", "summaryDetail"],
        }) as Promise<any>,
      ]);

      if (!quoteResult?.regularMarketPrice) return null;

      const fd = summaryResult?.financialData ?? {};
      const ks = summaryResult?.defaultKeyStatistics ?? {};
      const sd = summaryResult?.summaryDetail ?? {};

      return {
        ticker,
        name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
        price: quoteResult.regularMarketPrice,
        changePct: quoteResult.regularMarketChangePercent ?? 0,
        currency: quoteResult.currency ?? "USD",
        fiftyTwoWeekLow: quoteResult.fiftyTwoWeekLow ?? sd.fiftyTwoWeekLow ?? 0,
        fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
        trailingPE: sd.trailingPE ?? quoteResult.trailingPE ?? null,
        forwardPE: sd.forwardPE ?? quoteResult.forwardPE ?? null,
        pegRatio: ks.pegRatio ?? null,
        priceToBook: ks.priceToBook ?? null,
        revenueGrowth: fd.revenueGrowth != null ? fd.revenueGrowth * 100 : null,
        earningsGrowth: fd.earningsGrowth != null ? fd.earningsGrowth * 100 : null,
        grossMargins: fd.grossMargins != null ? fd.grossMargins * 100 : null,
        operatingMargins: fd.operatingMargins != null ? fd.operatingMargins * 100 : null,
        profitMargins: fd.profitMargins != null ? fd.profitMargins * 100 : null,
        trailingEps: ks.trailingEps ?? null,
        forwardEps: ks.forwardEps ?? null,
        beta: ks.beta ?? sd.beta ?? null,
        marketCap: quoteResult.marketCap ?? null,
      };
    } catch {
      return null;
    }
  };

  // Korean stock
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers");

  if (!tickersParam) {
    return NextResponse.json({ error: "tickers parameter required" }, { status: 400 });
  }

  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20); // max 20 tickers

  const results = await Promise.allSettled(tickers.map(getFundamentals));
  const data = results
    .filter((r): r is PromiseFulfilledResult<FundamentalsResult | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r): r is FundamentalsResult => r !== null);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}
