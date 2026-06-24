import { NextRequest, NextResponse } from "next/server";
import { getEarningsHistory, type EarningsQuarter } from "@/lib/yahoo-finance";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export interface StockEarningsResponse {
  ticker: string;
  supported: boolean;          // 분기 EPS 데이터 제공(미국 종목)
  quarters: EarningsQuarter[]; // 시간순 (과거→최근)
}

/** "1Q2025" → 정렬키 (year*4 + q). 파싱 실패 시 0. */
function quarterSortKey(q: string): number {
  const m = q.match(/^([1-4])Q(\d{4})$/);
  if (!m) return 0;
  return Number(m[2]) * 4 + Number(m[1]);
}

export async function GET(req: NextRequest) {
  const ticker = (new URL(req.url).searchParams.get("ticker") ?? "").trim();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // 한국 종목은 분기 EPS·추정치 데이터가 없음 → 미지원(상세의 연간 재무제표로 대체)
  const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);
  if (isKorean) {
    const body: StockEarningsResponse = { ticker, supported: false, quarters: [] };
    return NextResponse.json(body);
  }

  const cacheKey = `stock-earnings:${ticker}`;
  const cached = await getStockCache<StockEarningsResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const history = await getEarningsHistory(ticker);
  const quarters = (history ?? [])
    .slice()
    .sort((a, b) => quarterSortKey(a.quarter) - quarterSortKey(b.quarter))
    .slice(-8);

  const body: StockEarningsResponse = {
    ticker,
    supported: quarters.length > 0,
    quarters,
  };
  // 분기 실적은 자주 안 바뀜 → 6시간 캐시
  if (quarters.length > 0) await setStockCache(cacheKey, body, 6 * 60 * 60 * 1000);
  return NextResponse.json(body);
}
