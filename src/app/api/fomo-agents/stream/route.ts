import { fetchSentimentData } from "@/lib/fomo-sentiment";
import { AGENT_PROFILES, buildUserPrompt, runAgent, calcConsensus, setAgentsCache } from "@/lib/fomo-agents";
import type { AgentsResult } from "@/types/fomo";

export const maxDuration = 300;

export async function GET() {
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

        const agents: AgentsResult["agents"] = [];

        for (let i = 0; i < AGENT_PROFILES.length; i++) {
          const profile = AGENT_PROFILES[i];
          send({ type: "thinking", index: i, name: profile.name });

          const agent = await runAgent(profile, prompt);
          agents.push(agent);

          send({ type: "agent", index: i, agent });
        }

        const consensus = calcConsensus(agents);
        const timestamp = new Date().toISOString();
        const result: AgentsResult = { agents, consensus, timestamp };

        setAgentsCache({ data: result, ts: Date.now() });

        send({ type: "done", consensus, timestamp });
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
