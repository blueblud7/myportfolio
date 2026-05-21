import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { extractTicker, isKoreanTicker } from "@/lib/ticker-resolver";
import { getKrxAllPrices } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface StockSearchResult {
  ticker: string;   // 005930, AAPL 등
  name: string;     // 삼성전자, Apple Inc. 등
  exchange: string; // KOSPI, KOSDAQ, NMS 등
  symbol: string;   // Yahoo 심볼 (005930.KS, AAPL)
  sector?: string;  // KRX 업종명 (한국 주식만)
}

// KRX 전체 종목 캐시 (6시간)
async function getKrxStockMap(): Promise<Map<string, { name: string; market: string; sector: string }>> {
  const cacheKey = "krx:stock-map-search";
  const cached = await getStockCache<[string, { name: string; market: string; sector: string }][]>(cacheKey);
  if (cached) return new Map(cached);

  const [kospi, kosdaq] = await Promise.all([
    getKrxAllPrices("STK").catch(() => []),
    getKrxAllPrices("KSQ").catch(() => []),
  ]);
  const map = new Map<string, { name: string; market: string; sector: string }>();
  for (const p of [...kospi, ...kosdaq]) {
    map.set(p.code, { name: p.name, market: p.market, sector: p.sector });
  }
  await setStockCache(cacheKey, Array.from(map.entries()), 6 * 60 * 60 * 1000);
  return map;
}

// 한국 주식 여부 판별 (6자리 숫자 코드 or 한글 포함)
function looksKorean(q: string): boolean {
  return /^\d{4,6}$/.test(q) || /[가-힣]/.test(q);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 1) return NextResponse.json([]);

  const query = q.trim();

  try {
    // 한국 주식 쿼리는 KRX 데이터 우선 사용
    if (looksKorean(query)) {
      const krxMap = await getKrxStockMap();
      const ql = query.toLowerCase();
      const krxResults: StockSearchResult[] = [];

      for (const [code, info] of krxMap) {
        if (code.includes(query) || info.name.toLowerCase().includes(ql)) {
          krxResults.push({
            ticker: code,
            name: info.name,
            exchange: info.market,
            symbol: code + (info.market === "KOSPI" ? ".KS" : ".KQ"),
            sector: info.sector,
          });
        }
      }

      if (krxResults.length > 0) {
        // 코드 완전일치 > 이름 완전일치 > 포함 순
        krxResults.sort((a, b) => {
          const aScore = a.ticker === query ? 0 : a.name === query ? 1 : 2;
          const bScore = b.ticker === query ? 0 : b.name === query ? 1 : 2;
          return aScore - bScore;
        });
        return NextResponse.json(krxResults.slice(0, 12));
      }
    }

    // Yahoo Finance 검색 (해외 주식 or KRX에 없는 경우)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.search(query, {}, { validateResult: false });
    const quotes = result?.quotes ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yahooResults: StockSearchResult[] = quotes
      .filter((item: any) => ["EQUITY", "ETF"].includes(item.quoteType) && item.symbol)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => {
        const ticker = extractTicker(item.symbol);
        const isKr = isKoreanTicker(ticker);
        return {
          ticker,
          name: item.shortname ?? item.longname ?? item.shortName ?? item.longName ?? item.symbol,
          exchange: item.quoteType === "ETF" ? "ETF" : (item.exchDisp ?? item.exchange ?? ""),
          symbol: item.symbol,
          ...(isKr ? { sector: "" } : {}),
        };
      })
      .slice(0, 10);

    // Yahoo 결과에서 한국 주식이 나온 경우 KRX 데이터로 이름/섹터 보완
    const krxMap = looksKorean(query) ? null : await getKrxStockMap().catch(() => null);
    const enriched = yahooResults.map(r => {
      if (isKoreanTicker(r.ticker) && krxMap) {
        const krx = krxMap.get(r.ticker);
        if (krx) return { ...r, name: krx.name, exchange: krx.market, sector: krx.sector };
      }
      return r;
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Stock search error:", err);
    return NextResponse.json([]);
  }
}
