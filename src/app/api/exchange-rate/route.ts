import { NextResponse } from "next/server";
import { getLatestExchangeRate, forceRefreshExchangeRate } from "@/lib/exchange-rate";

export async function GET() {
  const rate = await getLatestExchangeRate();
  return NextResponse.json({ rate });
}

/** 강제 갱신: 외부 API에서 새로 조회하여 DB에 덮어씁니다. */
export async function POST() {
  const rate = await forceRefreshExchangeRate();
  return NextResponse.json({ rate });
}
