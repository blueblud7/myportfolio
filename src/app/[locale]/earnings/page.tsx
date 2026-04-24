"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, RefreshCw, Briefcase, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EarningsCalendarItem } from "@/app/api/earnings-calendar/route";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / MS_PER_DAY);
}

function groupKey(days: number | null): string {
  if (days === null) return "미정";
  if (days < 0) return "지남";
  if (days === 0) return "오늘";
  if (days <= 7) return "이번주";
  if (days <= 14) return "다음주";
  if (days <= 30) return "이달 내";
  if (days <= 60) return "다음달";
  return "그 이후";
}

const GROUP_ORDER = ["오늘", "이번주", "다음주", "이달 내", "다음달", "그 이후", "미정", "지남"];

function SourceBadge({ source }: { source: string }) {
  if (source === "holding") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
        <Briefcase className="h-2.5 w-2.5" />보유
      </span>
    );
  }
  if (source === "watchlist") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
        <Eye className="h-2.5 w-2.5" />관심
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
      보유 · 관심
    </span>
  );
}

function DDayBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">미정</span>;
  }
  if (days < 0) {
    return <span className="rounded bg-zinc-500/20 px-2 py-0.5 text-[11px] text-zinc-500">D+{Math.abs(days)}</span>;
  }
  if (days === 0) {
    return <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-300">D-DAY</span>;
  }
  const color =
    days <= 3 ? "bg-red-500/20 text-red-700 dark:text-red-300" :
    days <= 7 ? "bg-orange-500/20 text-orange-700 dark:text-orange-300" :
    days <= 30 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
    "bg-muted text-muted-foreground";
  return <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", color)}>D-{days}</span>;
}

export default function EarningsCalendarPage() {
  const [items, setItems] = useState<EarningsCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/earnings-calendar");
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/earnings-calendar", { method: "POST" });
      const data: { updated: number; failed: string[]; total: number } = await res.json();
      setRefreshMsg(
        `${data.total}개 종목 중 ${data.updated}개 업데이트${data.failed.length ? ` · 실패: ${data.failed.join(", ")}` : ""}`
      );
      await load();
    } catch {
      setRefreshMsg("갱신 실패");
    } finally {
      setRefreshing(false);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, EarningsCalendarItem[]> = {};
    for (const item of items) {
      const days = daysUntil(item.earnings_date);
      const key = groupKey(days);
      (g[key] ??= []).push(item);
    }
    return g;
  }, [items]);

  const hasData = items.length > 0;
  const withDates = items.filter((i) => i.earnings_date).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
            <CalendarDays className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">실적 캘린더</h1>
            <p className="text-sm text-muted-foreground">
              {hasData ? `보유·관심 ${items.length}개 종목 · 일정 ${withDates}개 확인됨` : "보유·관심 종목의 실적발표 일정"}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-muted/40"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Yahoo 조회 중..." : "일정 갱신"}
        </button>
      </div>

      {refreshMsg && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {refreshMsg}
        </div>
      )}

      {loading && !hasData ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 opacity-20" />
          <p className="text-sm">보유 또는 관심 종목이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.filter((k) => grouped[k]?.length).map((key) => (
            <div key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {key} <span className="text-muted-foreground/60">({grouped[key].length})</span>
              </h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {grouped[key].map((item, idx) => {
                  const days = daysUntil(item.earnings_date);
                  return (
                    <div
                      key={item.ticker}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        idx > 0 && "border-t border-border"
                      )}
                    >
                      <DDayBadge days={days} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{item.ticker}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                          <SourceBadge source={item.source} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                          {item.earnings_date && <span>📅 {item.earnings_date}</span>}
                          {item.eps_estimate !== null && (
                            <span>EPS 추정 ${item.eps_estimate.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
