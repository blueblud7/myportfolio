"use client";

import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexData {
  key: string;
  label: string;
  symbol: string;
  isYield: boolean;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  prevClose: number | null;
  oilSpread?: number | null;
  oilCurve?: "contango" | "backwardation" | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatPrice(price: number, key: string) {
  if (key === "btc") return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "kospi") return price.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function currencyPrefix(key: string, currency: string) {
  if (key === "kospi") return "";
  if (currency === "USD") return "$";
  return "";
}

export function MarketIndices() {
  const { data, isLoading } = useSWR<IndexData[]>("/api/market-indices", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 w-36 shrink-0 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {data.map((idx) => {
        const chg = idx.changePct ?? 0;
        const up = chg > 0;
        const down = chg < 0;

        // 금리 카드
        if (idx.isYield) {
          const bps = idx.change != null ? Math.round(idx.change * 100 * 10) / 10 : null;
          return (
            <div key={idx.key} className={cn(
              "flex shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2 min-w-[120px] bg-card",
              up && "border-orange-400/50",
              down && "border-blue-400/50",
              !up && !down && "border-border",
            )}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-muted-foreground">{idx.label}</span>
                <span className="text-[10px] text-muted-foreground">금리</span>
              </div>
              {idx.price != null ? (
                <>
                  <span className="font-mono text-sm font-bold leading-tight">
                    {idx.price.toFixed(2)}%
                  </span>
                  {bps != null && (
                    <span className={cn("text-xs font-mono",
                      up && "text-orange-400", down && "text-blue-400", !up && !down && "text-muted-foreground")}>
                      {bps > 0 ? "+" : ""}{bps}bps
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        }

        // WTI 유가 카드 (콘탱고/백워데이션 배지 포함)
        if (idx.key === "wti") {
          const curve = idx.oilCurve;
          const spread = idx.oilSpread;
          return (
            <div key={idx.key} className={cn(
              "flex shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2 min-w-[150px] bg-card",
              up && "border-emerald-300/70 dark:border-emerald-700/50",
              down && "border-red-300/70 dark:border-red-700/50",
              !up && !down && "border-border",
            )}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-muted-foreground">{idx.label}</span>
                {curve && (
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-bold leading-none",
                    curve === "contango"
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-emerald-500/20 text-emerald-400",
                  )}>
                    {curve === "contango" ? "콘탱고" : "백워데이션"}
                  </span>
                )}
              </div>
              {idx.price != null ? (
                <>
                  <span className="font-mono text-sm font-bold leading-tight">
                    ${formatPrice(idx.price, idx.key)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-mono",
                      up && "text-emerald-600 dark:text-emerald-400",
                      down && "text-red-500 dark:text-red-400",
                      !up && !down && "text-muted-foreground")}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </span>
                    {spread != null && (
                      <span className="text-[10px] text-muted-foreground">
                        스프레드 {spread > 0 ? "+" : ""}{spread.toFixed(2)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        }

        // 일반 지수 카드
        return (
          <div key={idx.key} className={cn(
            "flex shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2 min-w-[130px] bg-card",
            up && "border-emerald-300/70 dark:border-emerald-700/50",
            down && "border-red-300/70 dark:border-red-700/50",
            !up && !down && "border-border",
          )}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{idx.label}</span>
              {up && <TrendingUp className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />}
              {down && <TrendingDown className="h-3 w-3 text-red-500 dark:text-red-400" />}
              {!up && !down && <Minus className="h-3 w-3 text-muted-foreground" />}
            </div>
            {idx.price != null ? (
              <>
                <span className="font-mono text-sm font-bold leading-tight">
                  {currencyPrefix(idx.key, idx.currency)}{formatPrice(idx.price, idx.key)}
                </span>
                <span className={cn("text-xs font-mono",
                  up && "text-emerald-600 dark:text-emerald-400",
                  down && "text-red-500 dark:text-red-400",
                  !up && !down && "text-muted-foreground")}>
                  {up ? "+" : ""}{chg.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
