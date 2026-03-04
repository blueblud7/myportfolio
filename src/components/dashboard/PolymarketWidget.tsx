"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { Search, X } from "lucide-react";
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

function EventList({ apiUrl, isSearch }: { apiUrl: string; isSearch: boolean }) {
  const { data, isLoading, error } = useSWR<PolymarketEvent[]>(apiUrl, fetcher, {
    refreshInterval: isSearch ? 0 : 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: isSearch ? 60_000 : 300_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        {isSearch ? "검색 결과가 없습니다." : "예측 데이터를 불러올 수 없습니다."}
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
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold leading-snug line-clamp-1">{event.title}</p>
            <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{formatVolume(event.volume)}</span>
              {event.endDate && <span>· {event.endDate}</span>}
            </div>
          </div>
          {event.markets.map((m, i) => (
            <MarketRow key={i} market={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PolymarketWidget() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 300ms 디바운스
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQuery(input.trim()), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input]);

  const apiUrl = query
    ? `/api/polymarket?q=${encodeURIComponent(query)}`
    : "/api/polymarket";

  return (
    <div className="space-y-3">
      {/* 검색창 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="이벤트 검색... (예: bitcoin, election, fed)"
          className="w-full rounded-md border bg-background py-1.5 pl-8 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        {input && (
          <button
            onClick={() => setInput("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <EventList apiUrl={apiUrl} isSearch={!!query} />

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
        · {query ? "검색 결과" : "5분 갱신"}
      </p>
    </div>
  );
}
