// GET /api/krx/search?q=삼성전자 → KRX 상장종목 검색
// Yahoo보다 정확한 한국 주식 검색 (KRX 공식 데이터)

import { NextRequest, NextResponse } from "next/server";
import { getKrxAllPrices } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 30;

let _allStocksCache: { code: string; name: string; market: string; sector: string }[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간 (종목 목록은 자주 안 바뀜)

async function getAllKrxStocks() {
  if (_allStocksCache && Date.now() - _cacheTime < CACHE_TTL) return _allStocksCache;
  const cacheKey = "krx:all-stocks-list";
  const cached = await getStockCache<typeof _allStocksCache>(cacheKey);
  if (cached) { _allStocksCache = cached; _cacheTime = Date.now(); return cached; }

  const [kospi, kosdaq] = await Promise.all([
    getKrxAllPrices("STK"),
    getKrxAllPrices("KSQ"),
  ]);
  const all = [...kospi, ...kosdaq].map(p => ({
    code: p.code,
    name: p.name,
    market: p.market,
    sector: p.sector,
  }));
  await setStockCache(cacheKey, all, CACHE_TTL);
  _allStocksCache = all;
  _cacheTime = Date.now();
  return all;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  try {
    const stocks = await getAllKrxStocks();
    const ql = q.toLowerCase();
    const results = stocks
      .filter(s =>
        s.code.includes(q) ||
        s.name.toLowerCase().includes(ql)
      )
      .sort((a, b) => {
        // 코드 정확히 일치 우선
        const aExact = a.code === q ? 0 : a.name.toLowerCase() === ql ? 1 : 2;
        const bExact = b.code === q ? 0 : b.name.toLowerCase() === ql ? 1 : 2;
        return aExact - bExact;
      })
      .slice(0, 15)
      .map(s => ({
        ticker: s.code,
        name: s.name,
        exchange: s.market,
        symbol: s.code + (s.market === "KOSPI" ? ".KS" : ".KQ"),
        sector: s.sector,
      }));
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
