import { NextResponse } from "next/server";
import { agentsCache, setAgentsCache } from "@/lib/fomo-agents";

export const maxDuration = 60;

const CACHE_TTL = 30 * 60 * 1000; // 30분

export async function GET() {
  if (agentsCache && Date.now() - agentsCache.ts < CACHE_TTL) {
    return NextResponse.json(agentsCache.data);
  }
  return NextResponse.json({ cached: false });
}

export async function DELETE() {
  setAgentsCache(null);
  return NextResponse.json({ ok: true });
}
