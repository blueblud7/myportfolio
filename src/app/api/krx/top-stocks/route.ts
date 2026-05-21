// GET /api/krx/top-stocks?type=foreign&mkt=STK → 외국인 순매수 상위 종목
// GET /api/krx/top-stocks?type=institution&mkt=KSQ → 기관 순매수 상위 종목

import { NextRequest, NextResponse } from "next/server";
import { getKrxTopBuyStocks } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = (searchParams.get("type") ?? "foreign") as "foreign" | "institution";
  const mkt = (searchParams.get("mkt") ?? "STK") as "STK" | "KSQ";

  const cacheKey = `krx:top-stocks:${type}:${mkt}`;
  const cached = await getStockCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  const data = await getKrxTopBuyStocks(type, mkt);
  await setStockCache(cacheKey, data, 30 * 60 * 1000);
  return NextResponse.json(data);
}
