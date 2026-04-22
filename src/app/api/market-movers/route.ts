import { NextResponse } from "next/server";

export interface MarketMoverItem {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
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

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseQuotes(quotes: any[]): MarketMoverItem[] {
  return quotes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((q: any) => ({
      ticker: q.symbol ?? "",
      name: q.shortName ?? q.longName ?? q.symbol ?? "",
      price: Number(q.regularMarketPrice ?? 0),
      changePct: Number(q.regularMarketChangePercent ?? 0),
      volume: Number(q.regularMarketVolume ?? 0),
      avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
    }))
    .filter((q) => q.ticker && q.price > 0);
}

async function fetchScreener(scrId: string, region: string, count = 7): Promise<MarketMoverItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=${count}&region=${region}&lang=${region === "KR" ? "ko-KR" : "en-US"}`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const quotes = json?.finance?.result?.[0]?.quotes ?? [];
    return parseQuotes(quotes);
  } catch {
    return [];
  }
}

// 10분 in-memory 캐시
let cache: { data: MarketMoversResponse; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const [
    usGainers, usLosers, usActive,
    krGainers, krLosers, krActive,
  ] = await Promise.all([
    fetchScreener("day_gainers",  "US"),
    fetchScreener("day_losers",   "US"),
    fetchScreener("most_actives", "US"),
    fetchScreener("day_gainers",  "KR"),
    fetchScreener("day_losers",   "KR"),
    fetchScreener("most_actives", "KR"),
  ]);

  const data: MarketMoversResponse = {
    us: { gainers: usGainers, losers: usLosers, active: usActive },
    kr: { gainers: krGainers, losers: krLosers, active: krActive },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
