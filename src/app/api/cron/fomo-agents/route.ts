import { NextRequest, NextResponse } from "next/server";
import { fetchSentimentData } from "@/lib/fomo-sentiment";
import { AGENT_PROFILES, buildUserPrompt, runAgent, calcConsensus, computeContrarian } from "@/lib/fomo-agents";
import { writeFomoCache } from "@/lib/fomo-agents-cache";
import type { AgentsResult } from "@/types/fomo";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron 인증: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sentiment = await fetchSentimentData();
    const prompt = buildUserPrompt(sentiment);

    const agents = await Promise.all(AGENT_PROFILES.map((profile) => runAgent(profile, prompt)));
    const consensus = calcConsensus(agents);
    const contrarian = computeContrarian(consensus);
    const result: AgentsResult = {
      agents,
      consensus,
      contrarian,
      timestamp: new Date().toISOString(),
    };

    await writeFomoCache(result);

    return NextResponse.json({
      ok: true,
      generated_at: result.timestamp,
      agent_count: agents.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
