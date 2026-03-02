import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const INDICES = [
  { key: "nasdaq",  symbol: "^IXIC",   label: "NASDAQ" },
  { key: "sp500",   symbol: "^GSPC",   label: "S&P 500" },
  { key: "kospi",   symbol: "^KS11",   label: "KOSPI" },
  { key: "gold",    symbol: "GC=F",    label: "Gold" },
  { key: "btc",     symbol: "BTC-USD", label: "BTC/USD" },
];

export async function GET() {
  const results = await Promise.allSettled(
    INDICES.map(async (idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = await yf.quote(idx.symbol);
      return {
        key: idx.key,
        label: idx.label,
        symbol: idx.symbol,
        price: q?.regularMarketPrice ?? null,
        change: q?.regularMarketChange ?? null,
        changePct: q?.regularMarketChangePercent ?? null,
        currency: q?.currency ?? "USD",
        prevClose: q?.regularMarketPreviousClose ?? null,
      };
    })
  );

  const data = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { key: INDICES[i].key, label: INDICES[i].label, symbol: INDICES[i].symbol, price: null, change: null, changePct: null, currency: "USD", prevClose: null };
  });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
