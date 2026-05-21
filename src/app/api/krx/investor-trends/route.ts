// GET /api/krx/investor-trends?ticker=005930 → 개별종목 투자자별 매매동향 (30일)
// GET /api/krx/investor-trends?mkt=STK       → 시장 전체 투자자 추이 (20일)

import { NextRequest, NextResponse } from "next/server";
import { getKrxStockInvestors, getKrxMarketInvestorTrend } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const mkt = searchParams.get("mkt"); // "STK" | "KSQ" | "ALL"

  if (ticker) {
    const cacheKey = `krx:investor:${ticker}`;
    const cached = await getStockCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    const data = await getKrxStockInvestors(ticker, 30);
    await setStockCache(cacheKey, data, 30 * 60 * 1000); // 30분
    return NextResponse.json(data);
  }

  // 시장 전체 투자자 추이
  const cacheKey = `krx:market-investor-trend`;
  const cached = await getStockCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  const data = await getKrxMarketInvestorTrend(20);
  await setStockCache(cacheKey, data, 30 * 60 * 1000);
  return NextResponse.json(data);
}
