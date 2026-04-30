import { NextResponse } from "next/server";
import { readFomoCache } from "@/lib/fomo-agents-cache";

export const maxDuration = 30;

export async function GET() {
  const cache = await readFomoCache();
  if (!cache) {
    return NextResponse.json({
      cached: false,
      message: "아직 분석 결과 없음 — 다음 자동 갱신(매일 새벽 6시 KST)을 기다리거나 admin이 수동 실행",
    });
  }
  return NextResponse.json({
    ...cache.data,
    generated_at: cache.generated_at,
  });
}
