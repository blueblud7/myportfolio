import { NextResponse } from "next/server";
import { getLatestExchangeRate, forceRefreshExchangeRate } from "@/lib/exchange-rate";

// 라우트를 정적 캐시하지 않음 — 매 요청마다 신선도 윈도우 로직을 태운다.
export const dynamic = "force-dynamic";

export async function GET() {
  const rate = await getLatestExchangeRate();
  return NextResponse.json({ rate });
}

/** 강제 갱신: 외부 API에서 새로 조회하여 DB에 덮어씁니다. */
export async function POST() {
  const rate = await forceRefreshExchangeRate();
  return NextResponse.json({ rate });
}
