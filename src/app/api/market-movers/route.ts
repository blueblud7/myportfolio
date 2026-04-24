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

// ─── KR: Yahoo Finance quotes for major KOSPI stocks ─────────────────────────

const KR_TICKERS = [
  "005930.KS", // 삼성전자
  "000660.KS", // SK하이닉스
  "207940.KS", // 삼성바이오로직스
  "005380.KS", // 현대차
  "068270.KS", // 셀트리온
  "000270.KS", // 기아
  "005490.KS", // POSCO홀딩스
  "035420.KS", // NAVER
  "035720.KS", // 카카오
  "051910.KS", // LG화학
  "006400.KS", // 삼성SDI
  "066570.KS", // LG전자
  "055550.KS", // 신한지주
  "105560.KS", // KB금융
  "003550.KS", // LG
  "012330.KS", // 현대모비스
  "096770.KS", // SK이노베이션
  "028260.KS", // 삼성물산
  "017670.KS", // SK텔레콤
  "086790.KS", // 하나금융지주
  "034730.KS", // SK
  "009150.KS", // 삼성전기
  "011200.KS", // HMM
  "032830.KS", // 삼성생명
  "000810.KS", // 삼성화재
  "373220.KS", // LG에너지솔루션
  "247540.KS", // 에코프로비엠
  "091990.KS", // 셀트리온헬스케어
  "036570.KS", // 엔씨소프트
  "003670.KS", // 포스코퓨처엠
];

async function fetchKrMovers(count = 7): Promise<{ gainers: MarketMoverItem[]; losers: MarketMoverItem[]; active: MarketMoverItem[] }> {
  try {
    const symbols = KR_TICKERS.join(",");
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
        avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
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
