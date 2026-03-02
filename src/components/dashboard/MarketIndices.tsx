"use client";

import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexData {
  key: string;
  label: string;
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  prevClose: number | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatPrice(price: number, key: string) {
  if (key === "btc") {
    return price >= 10000
      ? price.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (key === "gold") {
    return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (key === "kospi") {
    return price.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }
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
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 w-36 shrink-0 animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {data.map((idx) => {
        const up = (idx.changePct ?? 0) > 0;
        const down = (idx.changePct ?? 0) < 0;
        const neutral = !up && !down;

        return (
          <div
            key={idx.key}
            className={cn(
              "flex shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2 min-w-[130px]",
              up && "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
              down && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
              neutral && "border-border bg-muted/30"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{idx.label}</span>
              {up && <TrendingUp className="h-3 w-3 text-emerald-600" />}
              {down && <TrendingDown className="h-3 w-3 text-red-500" />}
              {neutral && <Minus className="h-3 w-3 text-muted-foreground" />}
            </div>

            {idx.price != null ? (
              <>
                <span className="text-sm font-bold font-mono leading-tight">
                  {currencyPrefix(idx.key, idx.currency)}
                  {formatPrice(idx.price, idx.key)}
                </span>
                <span
                  className={cn(
                    "text-xs font-mono",
                    up && "text-emerald-600",
                    down && "text-red-500",
                    neutral && "text-muted-foreground"
                  )}
                >
                  {up ? "+" : ""}
                  {(idx.changePct ?? 0).toFixed(2)}%
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
