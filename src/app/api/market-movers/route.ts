import { NextResponse } from "next/server";

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

// ─── KR: Naver Finance ────────────────────────────────────────────────────────

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://m.stock.naver.com/",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNaverItem(s: any): MarketMoverItem {
  return {
    ticker: String(s.itemCode ?? s.stockCode ?? s.code ?? ""),
    name: String(s.itemName ?? s.stockName ?? s.name ?? ""),
    price: Number(String(s.currentPrice ?? s.closePrice ?? s.price ?? "0").replace(/,/g, "")),
    changePct: Number(String(s.fluctuationsRatio ?? s.changeRate ?? "0").replace(/[+,]/g, "")),
    volume: Number(String(s.accumulatedTradingVolume ?? s.tradingVolume ?? s.volume ?? "0").replace(/,/g, "")),
    avgVolume: 0,
    currency: "KRW",
  };
}

type NaverChangeType = "RISE" | "FALL" | "ACML_VOL";

async function fetchNaverKr(changeType: NaverChangeType, count = 7): Promise<MarketMoverItem[]> {
  try {
    const url = `https://m.stock.naver.com/api/stocks/up-down-list?marketType=KOSPI&changeType=${changeType}&pageSize=${count}&page=1`;
    const res = await fetch(url, { headers: NAVER_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = json?.stocks ?? json?.stockList ?? json?.list ?? [];
    return list
      .map(parseNaverItem)
      .filter((s) => s.ticker && s.price > 0)
      .slice(0, count);
  } catch {
    return [];
  }
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
    krGainers, krLosers, krActive,
  ] = await Promise.all([
    fetchYfScreener("day_gainers"),
    fetchYfScreener("day_losers"),
    fetchYfScreener("most_actives"),
    fetchNaverKr("RISE"),
    fetchNaverKr("FALL"),
    fetchNaverKr("ACML_VOL"),
  ]);

  const data: MarketMoversResponse = {
    us: { gainers: usGainers, losers: usLosers, active: usActive },
    kr: { gainers: krGainers, losers: krLosers, active: krActive },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
