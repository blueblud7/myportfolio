"use client";

import useSWR from "swr";
import { Bell, CalendarDays, Target, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodayWatchResponse } from "@/app/api/today-watch/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") return `₩${Math.round(price).toLocaleString("ko-KR")}`;
  return `$${price.toFixed(price < 10 ? 3 : 2)}`;
}

function DayBadge({ days }: { days: number }) {
  const color =
    days === 0 ? "bg-red-500/20 text-red-700 dark:text-red-300" :
    days <= 3 ? "bg-orange-500/20 text-orange-700 dark:text-orange-300" :
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums", color)}>
      {days === 0 ? "D-DAY" : `D-${days}`}
    </span>
  );
}

export function TodayWatchWidget() {
  const { data, isLoading } = useSWR<TodayWatchResponse>("/api/today-watch", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const total =
    (data?.earnings.length ?? 0) +
    (data?.targetsReached.length ?? 0) +
    (data?.dividends.length ?? 0);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-5 w-32 bg-muted/50 rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data || total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">오늘 챙길 것</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          이번주 실적 · 목표가 도달 · 배당락 임박 종목 없음
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">오늘 챙길 것</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">
            {total}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {data.targetsReached.length > 0 && (
          <section>
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Target className="h-3 w-3" /> 목표가 도달 ({data.targetsReached.length})
            </p>
            <div className="space-y-1">
              {data.targetsReached.map((item, i) => {
                const isBuy = item.type === "buy";
                return (
                  <div
                    key={`${item.ticker}-${item.type}-${i}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                      isBuy ? "bg-emerald-500/10" : "bg-amber-500/10"
                    )}
                  >
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                      isBuy ? "bg-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/30 text-amber-700 dark:text-amber-300"
                    )}>
                      {isBuy ? "매수가" : "매도가"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{item.ticker}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{item.name}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-semibold">{formatPrice(item.current, item.currency)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        목표 {formatPrice(item.target, item.currency)} ({item.gap_pct >= 0 ? "+" : ""}{item.gap_pct.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {data.earnings.length > 0 && (
          <section>
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3 w-3" /> 이번주 실적 ({data.earnings.length})
            </p>
            <div className="space-y-1">
              {data.earnings.map((item) => (
                <div key={item.ticker} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
                  <DayBadge days={item.days} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold">{item.ticker}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{item.name}</span>
                      {item.source === "watchlist" && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">관심</span>
                      )}
                      {item.source === "both" && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-700 dark:text-violet-300">보유·관심</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{item.earnings_date}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.dividends.length > 0 && (
          <section>
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3 w-3" /> 배당락 임박 ({data.dividends.length})
            </p>
            <div className="space-y-1">
              {data.dividends.map((item) => (
                <div key={item.ticker} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
                  <DayBadge days={item.days} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold">{item.ticker}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{item.name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className="font-semibold">${item.per_share_amount.toFixed(2)}/주</p>
                    <p className="text-[10px] text-muted-foreground">{item.ex_dividend_date}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
