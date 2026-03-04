"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import type { PolymarketEvent } from "@/app/api/polymarket/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatVolume(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function ProbabilityBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
      />
    </div>
  );
}

function MarketRow({ market }: { market: PolymarketEvent["markets"][number] }) {
  const { outcomes, prices } = market;

  // Yes/No 단순 마켓
  if (outcomes.length === 2 && outcomes[0] === "Yes" && outcomes[1] === "No") {
    const yesPct = prices[0] ?? 0;
    const color =
      yesPct >= 0.7 ? "bg-emerald-500" : yesPct >= 0.4 ? "bg-yellow-500" : "bg-red-400";
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground truncate pr-2">{market.question}</span>
          <span className={cn("shrink-0 font-bold tabular-nums",
            yesPct >= 0.7 ? "text-emerald-500" : yesPct >= 0.4 ? "text-yellow-500" : "text-red-400"
          )}>
            {(yesPct * 100).toFixed(0)}%
          </span>
        </div>
        <ProbabilityBar pct={yesPct} color={color} />
      </div>
    );
  }

  // 다중 outcome 마켓 (상위 3개만)
  const top = outcomes
    .map((o, i) => ({ label: o, pct: prices[i] ?? 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground truncate">{market.question}</p>
      {top.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{item.label}</span>
          <div className="flex-1">
            <ProbabilityBar pct={item.pct} color="bg-blue-500" />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums">
            {(item.pct * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function PolymarketWidget() {
  const { data, isLoading, error } = useSWR<PolymarketEvent[]>("/api/polymarket", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        예측 데이터를 불러올 수 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border bg-card px-3 py-2.5 space-y-2"
        >
          {/* 이벤트 헤더 */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold leading-snug line-clamp-1">{event.title}</p>
            <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{formatVolume(event.volume)}</span>
              {event.endDate && <span>· {event.endDate}</span>}
            </div>
          </div>

          {/* 마켓 행 */}
          {event.markets.map((m, i) => (
            <MarketRow key={i} market={m} />
          ))}
        </div>
      ))}

      <p className="pt-1 text-center text-[10px] text-muted-foreground">
        Powered by{" "}
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Polymarket
        </a>{" "}
        · 5분 갱신
      </p>
    </div>
  );
}
