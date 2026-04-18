"use client";

import { useState } from "react";
import { useFomoAgents, useFomoSentiment } from "@/hooks/use-api";
import type { AgentAnalysis, AgentsResult, SentimentData } from "@/types/fomo";
import { cn } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

function actionColor(action: string) {
  if (action === "Buy") return "text-emerald-500";
  if (action === "Sell") return "text-red-500";
  return "text-yellow-500";
}

function actionBg(action: string) {
  if (action === "Buy") return "bg-emerald-500/10 border-emerald-500/30";
  if (action === "Sell") return "bg-red-500/10 border-red-500/30";
  return "bg-yellow-500/10 border-yellow-500/30";
}

function ActionIcon({ action }: { action: string }) {
  if (action === "Buy") return <TrendingUp className="h-3.5 w-3.5" />;
  if (action === "Sell") return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function fomoColor(score: number) {
  if (score <= 2) return "text-blue-400";
  if (score <= 4) return "text-emerald-400";
  if (score <= 6) return "text-yellow-400";
  if (score <= 8) return "text-orange-400";
  return "text-red-400";
}

function AgentCard({ agent }: { agent: AgentAnalysis }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3 transition-all", actionBg(agent.action))}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">{agent.id}</span>
            <span className="text-sm font-semibold">{agent.name}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{agent.style}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs font-bold", fomoColor(agent.fomoScore))}>
            FOMO {agent.fomoScore}/10
          </span>
          <div className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold", actionColor(agent.action), actionBg(agent.action))}>
            <ActionIcon action={agent.action} />
            {agent.action}
          </div>
        </div>
      </div>

      <p className="text-xs text-foreground leading-relaxed">{agent.interpretation}</p>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "접기" : "내면의 독백 보기"}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border/50 pt-2">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">내면의 독백</p>
            <p className="text-xs italic text-foreground/80 leading-relaxed">"{agent.innerMonologue}"</p>
          </div>
          {agent.warning && (
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-2.5">
              <p className="text-[10px] font-semibold text-orange-500 mb-1">⚠️ 경고</p>
              <p className="text-xs text-foreground/80">{agent.warning}</p>
            </div>
          )}
          {agent.biasesDetected.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.biasesDetected.map((b) => (
                <span key={b} className="text-[9px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{b}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConsensusBar({ buyPct, holdPct, sellPct }: { buyPct: number; holdPct: number; sellPct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500 transition-all" style={{ width: `${buyPct}%` }} />
        <div className="bg-yellow-400 transition-all" style={{ width: `${holdPct}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${sellPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span className="text-emerald-500 font-semibold">매수 {buyPct}%</span>
        <span className="text-yellow-500 font-semibold">관망 {holdPct}%</span>
        <span className="text-red-500 font-semibold">매도 {sellPct}%</span>
      </div>
    </div>
  );
}

export default function FomoAgentsPage() {
  const { data: agentsData, isLoading, mutate } = useFomoAgents();
  const { data: sentimentData } = useFomoSentiment();
  const d = agentsData as AgentsResult | undefined;
  const s = sentimentData as SentimentData | undefined;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // 캐시 무효화용 별도 엔드포인트 없이 SWR revalidate
    await mutate();
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
              <Brain className="h-5 w-5 text-violet-500" />
            </div>
            <h1 className="text-2xl font-bold">AI 투자자 에이전트</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            12개 투자자 페르소나가 현재 시장을 분석합니다 · gpt-5-nano · 1시간 캐시
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          새로고침
        </button>
      </div>

      {/* 현재 시장 심리 요약 */}
      {s && (
        <div className="grid grid-cols-4 gap-3">
          {(["Overall", "KR", "US", "Crypto"] as const).map((m) => (
            <div key={m} className="rounded-xl border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium">{m}</p>
              <p className="text-2xl font-black tabular-nums mt-0.5">{s[m]}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.labels[m]}</p>
            </div>
          ))}
        </div>
      )}

      {/* 컨센서스 */}
      {d && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">에이전트 컨센서스</h2>
            <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold border",
              actionColor(d.consensus.weightedAction), actionBg(d.consensus.weightedAction))}>
              <ActionIcon action={d.consensus.weightedAction} />
              {d.consensus.weightedAction === "Buy" ? "매수 우세" : d.consensus.weightedAction === "Sell" ? "매도 우세" : "관망 우세"}
            </div>
          </div>
          <ConsensusBar buyPct={d.consensus.buyPct} holdPct={d.consensus.holdPct} sellPct={d.consensus.sellPct} />
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>평균 FOMO 점수: <span className={cn("font-bold", fomoColor(d.consensus.avgFomoScore))}>{d.consensus.avgFomoScore}/10</span></span>
            <span>{new Date(d.timestamp).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준</span>
          </div>
        </div>
      )}

      {/* 에이전트 카드 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-4/5 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : d ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {d.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
          <Brain className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">에이전트 분석을 불러오는 중...</p>
          <p className="text-muted-foreground/60 text-xs">OPENAI_API_KEY가 설정되어 있어야 합니다.</p>
        </div>
      )}
    </div>
  );
}
