import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { extractTicker } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface StockSearchResult {
  ticker: string;   // 005930, AAPL 등
  name: string;     // 삼성전자, Apple Inc. 등
  exchange: string; // KSC, NMS 등
  symbol: string;   // Yahoo 심볼 (005930.KS, AAPL)
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 1) {
    return NextResponse.json([]);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.search(q.trim());
    const quotes = result?.quotes ?? [];

    const stocks: StockSearchResult[] = quotes
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => ["EQUITY", "ETF"].includes(q.quoteType) && q.symbol
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        ticker: extractTicker(q.symbol),
        name: q.shortname ?? q.longname ?? q.shortName ?? q.longName ?? q.symbol,
        exchange: q.quoteType === "ETF" ? "ETF" : (q.exchDisp ?? q.exchange ?? ""),
        symbol: q.symbol,
      }))
      .slice(0, 10);

    return NextResponse.json(stocks);
  } catch (err) {
    console.error("Stock search error:", err);
    return NextResponse.json([]);
  }
}
