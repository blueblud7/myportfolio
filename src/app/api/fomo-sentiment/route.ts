import { NextResponse } from "next/server";
import { fetchSentimentData } from "@/lib/fomo-sentiment";
import type { SentimentData } from "@/types/fomo";

export type { SentimentData };

const CACHE_TTL = 5 * 60 * 1000;
let cache: { data: SentimentData; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }
  try {
    const data = await fetchSentimentData();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
