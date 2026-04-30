"use client";

import { useState, useEffect, useCallback } from "react";
import { useFomoSentiment } from "@/hooks/use-api";
import type { AgentAnalysis, AgentsResult, ContrarianSignal, SentimentData, TargetSector, TimeHorizon } from "@/types/fomo";
import { cn } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Star } from "lucide-react";
import { AIDisclaimer } from "@/components/layout/Disclaimer";

const SECTOR_LABEL: Record<TargetSector, string> = {
  "Tech": "테크",
  "Defense": "방어주",
  "Bonds": "채권",
  "Cash": "현금",
  "Crypto": "크립토",
  "KR-Large": "한국 대형",
  "KR-Small": "한국 중소",
  "Gold": "금",
  "Energy": "에너지",
  "Other": "기타",
};

const HORIZON_LABEL: Record<TimeHorizon, string> = {
  "1w": "1주",
  "1m": "1개월",
  "3m": "3개월",
  "1y": "1년",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Components ─────────────────────────────────────────────────────────────

function ConfidenceStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-yellow-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-3 w-3", n <= value ? "fill-yellow-500" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
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
          <div
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold",
              actionColor(agent.action),
              actionBg(agent.action)
            )}
          >
            <ActionIcon action={agent.action} />
            {agent.action}
          </div>
        </div>
      </div>

      {/* Target sector / confidence / horizon */}
      {agent.action !== "Hold" && (
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 font-semibold text-violet-700 dark:text-violet-300">
            {SECTOR_LABEL[agent.targetSector]}
          </span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
            {HORIZON_LABEL[agent.timeHorizon]}
          </span>
          <ConfidenceStars value={agent.confidence} />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>FOMO 점수</span>
          <span className={cn("font-semibold", fomoColor(agent.fomoScore))}>{agent.fomoScore}/10</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              agent.fomoScore <= 4
                ? "bg-emerald-500"
                : agent.fomoScore <= 7
                ? "bg-yellow-400"
                : "bg-red-500"
            )}
            style={{ width: `${(agent.fomoScore / 10) * 100}%` }}
          />
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
            <p className="text-xs italic text-foreground/80 leading-relaxed">
              &ldquo;{agent.innerMonologue}&rdquo;
            </p>
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
                <span
                  key={b}
                  className="text-[9px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-2/3 rounded bg-muted" />
          <div className="h-2.5 w-1/3 rounded bg-muted" />
        </div>
        <div className="h-6 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
      </div>
      <div className="h-3 w-24 rounded bg-muted" />
    </div>
  );
}

function ConsensusBar({
  buyPct,
  holdPct,
  sellPct,
}: {
  buyPct: number;
  holdPct: number;
  sellPct: number;
}) {
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

// ─── SSE event shapes ────────────────────────────────────────────────────────

type SSEEvent =
  | { type: "start"; total: number }
  | { type: "thinking"; index: number; name: string }
  | { type: "agent"; index: number; agent: AgentAnalysis; completed: number; total: number }
  | { type: "done"; consensus: AgentsResult["consensus"]; contrarian: ContrarianSignal; timestamp: string }
  | { type: "error"; message: string };

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FomoAgentsPage() {
  const { data: sentimentData } = useFomoSentiment();
  const s = sentimentData as SentimentData | undefined;

  const [agents, setAgents] = useState<AgentAnalysis[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, thinking: 0 });
  const [consensus, setConsensus] = useState<AgentsResult["consensus"] | null>(null);
  const [contrarian, setContrarian] = useState<ContrarianSignal | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(() => {
    setStreaming(true);
    setAgents([]);
    setConsensus(null);
    setContrarian(null);
    setTimestamp(null);
    setLoaded(false);
    setError(null);
    setProgress({ current: 0, total: 0, thinking: 0 });

    fetch("/api/fomo-agents/stream")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        let buffer = "";

        function processChunk() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                setStreaming(false);
                return;
              }

              buffer += textDecoder.decode(value, { stream: true });

              // Split on double newline (SSE event separator)
              const parts = buffer.split("\n\n");
              buffer = parts.pop() ?? "";

              for (const part of parts) {
                for (const line of part.split("\n")) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const evt = JSON.parse(line.slice(6)) as SSEEvent;
                    handleEvent(evt);
                  } catch {
                    // ignore malformed lines
                  }
                }
              }

              processChunk();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
              setStreaming(false);
            });
        }

        processChunk();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setStreaming(false);
      });

    function handleEvent(evt: SSEEvent) {
      if (evt.type === "start") {
        setProgress((p) => ({ ...p, total: evt.total }));
      } else if (evt.type === "thinking") {
        setProgress((p) => ({ ...p, thinking: p.thinking + 1 }));
      } else if (evt.type === "agent") {
        setAgents((prev) => [...prev, evt.agent]);
        setProgress((p) => ({ ...p, current: evt.completed }));
      } else if (evt.type === "done") {
        setConsensus(evt.consensus);
        setContrarian(evt.contrarian);
        setTimestamp(evt.timestamp);
        setLoaded(true);
        setStreaming(false);
      } else if (evt.type === "error") {
        setError(evt.message);
        setStreaming(false);
      }
    }
  }, []);

  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // 어드민 여부 — 백엔드 판정 결과 사용 (UI 힌트용. 실제 권한은 /api/fomo-agents/stream에서 재검증)
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (d?.isAdmin === true) setIsUserAdmin(true);
    }).catch(() => {});
  }, []);

  // 마운트 시 DB 캐시만 읽음 (자동 stream 트리거 안 함)
  useEffect(() => {
    fetch("/api/fomo-agents")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (
          data &&
          typeof data === "object" &&
          "agents" in data &&
          "consensus" in data &&
          "timestamp" in data
        ) {
          const result = data as AgentsResult & { generated_at?: string };
          setAgents(result.agents);
          setConsensus(result.consensus);
          setContrarian(result.contrarian ?? { active: false, reason: "" });
          setTimestamp(result.timestamp);
          setGeneratedAt(result.generated_at ?? result.timestamp);
          setProgress({ current: result.agents.length, total: result.agents.length, thinking: 0 });
          setLoaded(true);
        }
        // 캐시 없으면 그냥 빈 상태 — admin이 수동 실행하거나 다음 cron 기다림
      })
      .catch(() => {});
  }, []);

  const handleRefresh = async () => {
    if (!isUserAdmin) return; // 일반 유저는 트리거 불가
    startStream();
  };

  const skeletonCount =
    streaming && progress.total > 0 ? Math.max(0, progress.total - agents.length) : 0;

  const progressPct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
              <Brain className="h-5 w-5 text-violet-500" />
            </div>
            <h1 className="text-2xl font-bold">AI 투자자 에이전트</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            투자자 페르소나가 현재 시장을 분석합니다 · 매일 새벽 6시(KST) 자동 갱신
            {generatedAt && (
              <span className="ml-2 text-foreground/70">
                · 마지막 분석: {new Date(generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        {isUserAdmin && (
          <button
            onClick={handleRefresh}
            disabled={streaming}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Admin only — 즉시 재분석"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", streaming && "animate-spin")} />
            수동 갱신
          </button>
        )}
      </div>

      {/* Progress section */}
      {streaming && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              {progress.thinking > 0 && progress.current < progress.total ? (
                <>
                  <span className="text-violet-500">{progress.thinking}개 에이전트</span> 병렬 분석 중...
                </>
              ) : (
                "분석 중..."
              )}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {progress.current}/{progress.total} 완료
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            모든 에이전트가 동시에 시장을 분석합니다
          </p>
        </div>
      )}

      {/* Sentiment summary */}
      {s && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {(["Overall", "KR", "US", "Crypto"] as const).map((m) => (
              <div key={m} className="rounded-xl border bg-card p-3 text-center">
                <p className="text-[10px] text-muted-foreground font-medium">{m}</p>
                <p className="text-2xl font-black tabular-nums mt-0.5">{s[m]}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.labels[m]}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              5일 추세 · {s.trendSummary ?? "—"}
            </p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground">VIX</p>
                <p className="font-semibold tabular-nums">
                  {s.raw.vix.toFixed(1)}
                  <span className={cn("ml-1 text-[10px]", s.raw.vix5dChangePct >= 0 ? "text-red-500" : "text-emerald-500")}>
                    5d {s.raw.vix5dChangePct >= 0 ? "+" : ""}{s.raw.vix5dChangePct.toFixed(1)}%
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">KOSPI</p>
                <p className="font-semibold tabular-nums">
                  <span className={s.raw.kospiChangePct >= 0 ? "text-emerald-500" : "text-red-500"}>
                    {s.raw.kospiChangePct >= 0 ? "+" : ""}{s.raw.kospiChangePct.toFixed(2)}%
                  </span>
                  <span className={cn("ml-1 text-[10px]", s.raw.kospi5dChangePct >= 0 ? "text-emerald-500" : "text-red-500")}>
                    5d {s.raw.kospi5dChangePct >= 0 ? "+" : ""}{s.raw.kospi5dChangePct.toFixed(1)}%
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">S&P500</p>
                <p className="font-semibold tabular-nums">
                  <span className={s.raw.sp500ChangePct >= 0 ? "text-emerald-500" : "text-red-500"}>
                    {s.raw.sp500ChangePct >= 0 ? "+" : ""}{s.raw.sp500ChangePct.toFixed(2)}%
                  </span>
                  <span className={cn("ml-1 text-[10px]", s.raw.sp5005dChangePct >= 0 ? "text-emerald-500" : "text-red-500")}>
                    5d {s.raw.sp5005dChangePct >= 0 ? "+" : ""}{s.raw.sp5005dChangePct.toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contrarian warning */}
      {contrarian?.active && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-0.5">
              컨트라리안 경고
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80">{contrarian.reason}</p>
          </div>
        </div>
      )}

      {/* Consensus */}
      {consensus && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">에이전트 컨센서스</h2>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold border",
                actionColor(consensus.weightedAction),
                actionBg(consensus.weightedAction)
              )}
            >
              <ActionIcon action={consensus.weightedAction} />
              {consensus.weightedAction === "Buy"
                ? "매수 우세"
                : consensus.weightedAction === "Sell"
                ? "매도 우세"
                : "관망 우세"}
            </div>
          </div>
          <ConsensusBar
            buyPct={consensus.buyPct}
            holdPct={consensus.holdPct}
            sellPct={consensus.sellPct}
          />
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-3">
              <span>
                평균 FOMO:{" "}
                <span className={cn("font-bold", fomoColor(consensus.avgFomoScore))}>
                  {consensus.avgFomoScore}/10
                </span>
              </span>
              <span>
                평균 확신: <span className="font-bold text-foreground">{consensus.avgConfidence}/5</span>
              </span>
            </div>
            {timestamp && (
              <span>
                {new Date(timestamp).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                기준
              </span>
            )}
          </div>

          {consensus.topSectors.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                에이전트 선호 섹터 (Hold 제외)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {consensus.topSectors.map((s, idx) => (
                  <span
                    key={s.sector}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      idx === 0
                        ? "bg-violet-500/20 text-violet-700 dark:text-violet-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {SECTOR_LABEL[s.sector]} · {s.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && !streaming && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
          <Brain className="h-10 w-10 text-red-400/60" />
          <p className="text-sm text-red-400">에이전트 분석 실패</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            OPENAI_API_KEY 환경변수가 Vercel에 설정되어 있는지 확인하세요.
          </p>
        </div>
      )}

      {/* 캐시 없을 때 — 다음 cron 안내 */}
      {!loaded && !streaming && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
          <Brain className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">아직 분석 결과가 없습니다.</p>
          <p className="text-muted-foreground/60 text-xs">
            매일 새벽 6시(KST) 자동 갱신됩니다.
            {isUserAdmin && " 우측 상단 '수동 갱신'으로 즉시 실행 가능."}
          </p>
        </div>
      )}

      {/* Agent cards grid */}
      {(agents.length > 0 || skeletonCount > 0) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))}
        </div>
      )}

      {agents.length > 0 && <AIDisclaimer className="mt-2" />}
    </div>
  );
}
