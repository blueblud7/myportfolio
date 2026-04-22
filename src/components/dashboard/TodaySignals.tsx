"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Zap, Star, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MoverItem, MoverSignal } from "@/app/api/movers/route";

const SIGNAL_META: Record<MoverSignal, { label: string; color: string }> = {
  up5:       { label: "+5%↑",    color: "bg-emerald-500/20 text-emerald-300" },
  up3:       { label: "+3%↑",    color: "bg-emerald-500/15 text-emerald-400" },
  down3:     { label: "-3%↓",    color: "bg-red-500/15 text-red-400" },
  down5:     { label: "-5%↓",    color: "bg-red-500/20 text-red-300" },
  vol_spike: { label: "거래량 2x", color: "bg-orange-500/20 text-orange-300" },
  high52:    { label: "52주 고가", color: "bg-yellow-500/20 text-yellow-300" },
  low52:     { label: "52주 저가", color: "bg-purple-500/20 text-purple-300" },
};

function SignalBadge({ signal }: { signal: MoverSignal }) {
  const m = SIGNAL_META[signal];
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", m.color)}>
      {m.label}
    </span>
  );
}

function MoverRow({ item }: { item: MoverItem }) {
  const isUp = item.changePct >= 0;
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors">
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        isUp ? "bg-emerald-500/15" : "bg-red-500/15"
      )}>
        {isUp
          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          : <TrendingDown className="h-3.5 w-3.5 text-red-400" />
        }
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{item.ticker}</span>
          <span className="truncate text-xs text-muted-foreground">{item.name}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {item.signals.filter(s => s !== "up3" && s !== "down3" && s !== "up5" && s !== "down5").map((s) => (
            <SignalBadge key={s} signal={s} />
          ))}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("text-base font-bold tabular-nums", isUp ? "text-emerald-400" : "text-red-400")}>
          {isUp ? "+" : ""}{item.changePct.toFixed(2)}%
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {item.currency === "USD" ? `$${item.price.toFixed(2)}` : `₩${item.price.toLocaleString()}`}
        </p>
      </div>
    </div>
  );
}

export function TodaySignals() {
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/movers");
      const data = await res.json();
      setMovers(data.movers ?? []);
      setDate(data.date ?? "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const gainers = movers.filter((m) => m.changePct >= 0);
  const losers  = movers.filter((m) => m.changePct < 0);
  const special = movers.filter((m) =>
    m.signals.some((s) => s === "vol_spike" || s === "high52" || s === "low52")
  );

  const hasData = movers.length > 0;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">Today&apos;s Signals</span>
          {date && (
            <span className="text-[10px] text-muted-foreground">{date} 기준</span>
          )}
        </div>
        <button
          onClick={load}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center text-muted-foreground">
          <Star className="h-8 w-8 opacity-20" />
          <p className="text-sm">오늘 눈에 띄는 움직임 없음</p>
          <p className="text-[11px] opacity-60">±2% 이상 변동 종목이 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 급등 */}
          {gainers.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-emerald-400">
                <TrendingUp className="h-3 w-3" /> 급등 {gainers.length}종목
              </p>
              <div className="space-y-0.5">
                {gainers.slice(0, 4).map((m) => <MoverRow key={m.ticker} item={m} />)}
              </div>
            </div>
          )}

          {/* 급락 */}
          {losers.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-red-400">
                <TrendingDown className="h-3 w-3" /> 급락 {losers.length}종목
              </p>
              <div className="space-y-0.5">
                {losers.slice(0, 4).map((m) => <MoverRow key={m.ticker} item={m} />)}
              </div>
            </div>
          )}

          {/* 특수 시그널 */}
          {special.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-orange-400">
                <AlertTriangle className="h-3 w-3" /> 특이 시그널
              </p>
              <div className="space-y-0.5">
                {special.slice(0, 4).map((m) => <MoverRow key={m.ticker} item={m} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
