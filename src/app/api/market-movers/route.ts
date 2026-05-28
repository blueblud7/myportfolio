import { NextResponse } from "next/server";
import { getKrxAllPrices } from "@/lib/krx";

export interface MarketMoverItem {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  currency?: string;
}

export interface MarketMoversResponse {
  us: {
    gainers: MarketMoverItem[];
    losers: MarketMoverItem[];
    active: MarketMoverItem[];
  };
  kr: {
    gainers: MarketMoverItem[];
    losers: MarketMoverItem[];
    active: MarketMoverItem[];
  };
  updatedAt: string;
}

// ─── US: Yahoo Finance screener ───────────────────────────────────────────────

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseYfQuotes(quotes: any[]): MarketMoverItem[] {
  return quotes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((q: any) => ({
      ticker: q.symbol ?? "",
      name: q.shortName ?? q.longName ?? q.symbol ?? "",
      price: Number(q.regularMarketPrice ?? 0),
      changePct: Number(q.regularMarketChangePercent ?? 0),
      volume: Number(q.regularMarketVolume ?? 0),
      avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
      currency: "USD",
    }))
    .filter((q) => q.ticker && q.price > 0);
}

async function fetchYfScreener(scrId: string, count = 7): Promise<MarketMoverItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=${count}&region=US&lang=en-US`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return parseYfQuotes(json?.finance?.result?.[0]?.quotes ?? []);
  } catch {
    return [];
  }
}

// ─── KR: KRX 전체 종목 기반 급등/급락주 (fallback: Yahoo Finance 30개 대형주) ─

async function fetchKrMoversKrx(count = 7): Promise<{ gainers: MarketMoverItem[]; losers: MarketMoverItem[]; active: MarketMoverItem[] } | null> {
  const [kospi, kosdaq] = await Promise.all([
    getKrxAllPrices("STK").catch(() => []),
    getKrxAllPrices("KSQ").catch(() => []),
  ]);
  const all = [...kospi, ...kosdaq].filter(p => p.close > 0);
  if (all.length < 20) return null; // KRX_API_KEY 미설정 등

  const stocks: MarketMoverItem[] = all.map(p => ({
    ticker: p.code,
    name: p.name,
    price: p.close,
    changePct: p.changePct,
    volume: p.volume,
    avgVolume: 0,
    currency: "KRW",
  }));

  const byChange = [...stocks].sort((a, b) => b.changePct - a.changePct);
  const byVolume = [...stocks].sort((a, b) => b.volume - a.volume);
  return {
    gainers: byChange.filter(s => s.changePct > 0).slice(0, count),
    losers: byChange.filter(s => s.changePct < 0).slice(-count).reverse(),
    active: byVolume.slice(0, count),
  };
}

const KR_FALLBACK_TICKERS = [
  "005930.KS", "000660.KS", "207940.KS", "005380.KS", "068270.KS",
  "000270.KS", "005490.KS", "035420.KS", "035720.KS", "051910.KS",
  "006400.KS", "066570.KS", "055550.KS", "105560.KS", "003550.KS",
  "012330.KS", "096770.KS", "028260.KS", "017670.KS", "086790.KS",
  "034730.KS", "009150.KS", "011200.KS", "032830.KS", "000810.KS",
  "373220.KS", "247540.KS", "091990.KS", "036570.KS", "003670.KS",
];

async function fetchKrMoversFallback(count = 7): Promise<{ gainers: MarketMoverItem[]; losers: MarketMoverItem[]; active: MarketMoverItem[] }> {
  try {
    const symbols = KR_FALLBACK_TICKERS.join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,currency`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return { gainers: [], losers: [], active: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = json?.quoteResponse?.result ?? [];
    const stocks: MarketMoverItem[] = quotes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        ticker: String(q.symbol ?? "").replace(/\.(KS|KQ)$/, ""),
        name: q.shortName ?? q.longName ?? q.symbol ?? "",
        price: Number(q.regularMarketPrice ?? 0),
        changePct: Number(q.regularMarketChangePercent ?? 0),
        volume: Number(q.regularMarketVolume ?? 0),
        avgVolume: Number(q.averageDailyVolume3Month ?? 0),
        currency: q.currency ?? "KRW",
      }))
      .filter((q) => q.ticker && q.price > 0);

    const byChange = [...stocks].sort((a, b) => b.changePct - a.changePct);
    const byVolume = [...stocks].sort((a, b) => b.volume - a.volume);
    return {
      gainers: byChange.slice(0, count),
      losers: byChange.slice(-count).reverse(),
      active: byVolume.slice(0, count),
    };
  } catch {
    return { gainers: [], losers: [], active: [] };
  }
}

async function fetchKrMovers(count = 7): Promise<{ gainers: MarketMoverItem[]; losers: MarketMoverItem[]; active: MarketMoverItem[] }> {
  const krx = await fetchKrMoversKrx(count);
  if (krx) return krx;
  return fetchKrMoversFallback(count);
}

// ─── Cache & handler ──────────────────────────────────────────────────────────

let cache: { data: MarketMoversResponse; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const [
    usGainers, usLosers, usActive,
    kr,
  ] = await Promise.all([
    fetchYfScreener("day_gainers"),
    fetchYfScreener("day_losers"),
    fetchYfScreener("most_actives"),
    fetchKrMovers(),
  ]);

  const data: MarketMoversResponse = {
    us: { gainers: usGainers, losers: usLosers, active: usActive },
    kr: { gainers: kr.gainers, losers: kr.losers, active: kr.active },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
