"use client";

import { useFomoSentiment } from "@/hooks/use-api";
import type { SentimentData } from "@/types/fomo";
import { cn } from "@/lib/utils";

function scoreColor(score: number): string {
  if (score <= 20) return "text-red-500";
  if (score <= 40) return "text-orange-500";
  if (score <= 60) return "text-yellow-500";
  if (score <= 80) return "text-emerald-500";
  return "text-green-400";
}

function scoreBarColor(score: number): string {
  if (score <= 20) return "bg-red-500";
  if (score <= 40) return "bg-orange-500";
  if (score <= 60) return "bg-yellow-400";
  if (score <= 80) return "bg-emerald-500";
  return "bg-green-400";
}

function GaugeBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className={cn("font-bold", scoreColor(score))}>{score}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", scoreBarColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className={cn("text-[10px] font-medium", scoreColor(score))}>
        {label === "KR" || label === "US" || label === "Crypto" || label === "Overall"
          ? (score <= 20 ? "극단적 공포" : score <= 40 ? "공포" : score <= 60 ? "중립" : score <= 80 ? "탐욕" : "극단적 탐욕")
          : ""}
      </div>
    </div>
  );
}

export function FomoSentimentWidget() {
  const { data, isLoading } = useFomoSentiment();
  const d = data as SentimentData | undefined;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">시장 심리 (FOMO/Fear)</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">VIX · 크립토 공포탐욕 · KOSPI/S&P500 모멘텀</p>
        </div>
        {d && (
          <div className={cn("text-2xl font-black tabular-nums", scoreColor(d.Overall))}>
            {d.Overall}
          </div>
        )}
      </div>

      {isLoading || !d ? (
        <div className="space-y-3">
          {["KR", "US", "Crypto"].map((m) => (
            <div key={m} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{m}</span>
                <span className="text-muted-foreground">···</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <GaugeBar score={d.KR} label="KR" />
          <GaugeBar score={d.US} label="US" />
          <GaugeBar score={d.Crypto} label="Crypto" />
          <div className="border-t border-border pt-3">
            <GaugeBar score={d.Overall} label="Overall" />
          </div>
        </div>
      )}

      {d && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-[10px] text-muted-foreground">
          <span>VIX <span className="font-mono text-foreground">{d.raw.vix.toFixed(1)}</span></span>
          <span>크립토 F&G <span className="font-mono text-foreground">{d.raw.cryptoFG}</span></span>
          <span>KOSPI <span className={cn("font-mono", d.raw.kospiChangePct >= 0 ? "text-emerald-500" : "text-red-500")}>
            {d.raw.kospiChangePct >= 0 ? "+" : ""}{d.raw.kospiChangePct.toFixed(2)}%
          </span></span>
          <span>S&P500 <span className={cn("font-mono", d.raw.sp500ChangePct >= 0 ? "text-emerald-500" : "text-red-500")}>
            {d.raw.sp500ChangePct >= 0 ? "+" : ""}{d.raw.sp500ChangePct.toFixed(2)}%
          </span></span>
          {d.raw.cnnFG !== null && (
            <span className="col-span-2 flex items-center justify-between border-t border-border pt-1 mt-0.5">
              <span>CNN Fear&Greed</span>
              <span className={cn("font-mono font-bold", scoreColor(d.raw.cnnFG))}>
                {d.raw.cnnFG} <span className="font-normal opacity-70">{d.raw.cnnFGLabel}</span>
              </span>
            </span>
          )}
        </div>
      )}

      {d && (
        <p className="text-[9px] text-muted-foreground/60 text-right">
          {new Date(d.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
        </p>
      )}
    </div>
  );
}
