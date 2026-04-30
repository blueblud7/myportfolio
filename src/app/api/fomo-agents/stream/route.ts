import { NextRequest, NextResponse } from "next/server";
import { fetchSentimentData } from "@/lib/fomo-sentiment";
import { AGENT_PROFILES, buildUserPrompt, runAgent, calcConsensus, computeContrarian } from "@/lib/fomo-agents";
import { writeFomoCache } from "@/lib/fomo-agents-cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import type { AgentsResult } from "@/types/fomo";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // 수동 실행은 admin만 — 일반 유저는 자동 캐시(/api/fomo-agents) 사용
  const user = await getSessionUser(req);
  if (!user || !isAdmin(user.username)) {
    return NextResponse.json(
      { error: "관리자만 수동 실행 가능합니다. 일반 분석은 매일 자동으로 갱신됩니다." },
      { status: 403 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        const sentiment = await fetchSentimentData();
        const prompt = buildUserPrompt(sentiment);

        send({ type: "start", total: AGENT_PROFILES.length });

        const agents: (AgentsResult["agents"][number] | null)[] = new Array(AGENT_PROFILES.length).fill(null);
        let completed = 0;

        await Promise.all(
          AGENT_PROFILES.map(async (profile, i) => {
            send({ type: "thinking", index: i, name: profile.name });
            const agent = await runAgent(profile, prompt);
            agents[i] = agent;
            completed++;
            send({ type: "agent", index: i, agent, completed, total: AGENT_PROFILES.length });
          })
        );

        const finalAgents = agents.filter((a): a is AgentsResult["agents"][number] => a !== null);
        const consensus = calcConsensus(finalAgents);
        const contrarian = computeContrarian(consensus);
        const timestamp = new Date().toISOString();
        const result: AgentsResult = { agents: finalAgents, consensus, contrarian, timestamp };

        await writeFomoCache(result);

        send({ type: "done", consensus, contrarian, timestamp });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
