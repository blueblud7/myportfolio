"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Minus, X, Plus } from "lucide-react";
import type { FundamentalsResult } from "@/app/api/fundamentals/route";

const STORAGE_KEY = "watchlist_tickers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatNum(n: number | null, digits = 1): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    return price.toLocaleString("ko-KR") + "원";
  }
  return "$" + price.toFixed(2);
}

function formatMarketCap(cap: number | null, currency: string): string {
  if (cap == null) return "—";
  if (currency === "KRW") {
    if (cap >= 1e12) return (cap / 1e12).toFixed(1) + "조";
    if (cap >= 1e8) return (cap / 1e8).toFixed(0) + "억";
    return cap.toLocaleString("ko-KR");
  }
  if (cap >= 1e12) return "$" + (cap / 1e12).toFixed(2) + "T";
  if (cap >= 1e9) return "$" + (cap / 1e9).toFixed(1) + "B";
  if (cap >= 1e6) return "$" + (cap / 1e6).toFixed(0) + "M";
  return "$" + cap.toLocaleString();
}

function TrendIcon({ value, threshold = 0 }: { value: number | null; threshold?: number }) {
  if (value == null) return <Minus className="inline h-3 w-3 text-muted-foreground" />;
  if (value > threshold) return <TrendingUp className="inline h-3 w-3 text-green-500" />;
  if (value < -threshold) return <TrendingDown className="inline h-3 w-3 text-red-500" />;
  return <Minus className="inline h-3 w-3 text-muted-foreground" />;
}

function FiftyTwoWeekBar({ low, high, current }: { low: number; high: number; current: number }) {
  if (!low || !high || high === low) return null;
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="w-8 text-right">{low.toFixed(0)}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="w-8">{high.toFixed(0)}</span>
    </div>
  );
}

function StockCard({ item, onRemove }: { item: FundamentalsResult; onRemove: (t: string) => void }) {
  const t = useTranslations("WatchlistWidget");
  const isUp = item.changePct >= 0;

  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">{item.ticker}</span>
            <span className={`text-xs font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
              {isUp ? "+" : ""}
              {formatNum(item.changePct)}%
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{item.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold">{formatPrice(item.price, item.currency)}</span>
          <button
            onClick={() => onRemove(item.ticker)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 52W bar */}
      {item.fiftyTwoWeekLow > 0 && item.fiftyTwoWeekHigh > 0 && (
        <FiftyTwoWeekBar low={item.fiftyTwoWeekLow} high={item.fiftyTwoWeekHigh} current={item.price} />
      )}

      {/* Fundamentals grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">{t("revenueGrowth")}</span>
          <div className="flex items-center gap-0.5 font-medium">
            <TrendIcon value={item.revenueGrowth} threshold={2} />
            <span>{item.revenueGrowth != null ? formatNum(item.revenueGrowth) + "%" : "—"}</span>
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">{t("opMargin")}</span>
          <div className="flex items-center gap-0.5 font-medium">
            <TrendIcon value={item.operatingMargins} threshold={5} />
            <span>{item.operatingMargins != null ? formatNum(item.operatingMargins) + "%" : "—"}</span>
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">{t("epsGrowth")}</span>
          <div className="flex items-center gap-0.5 font-medium">
            <TrendIcon value={item.earningsGrowth} threshold={2} />
            <span>{item.earningsGrowth != null ? formatNum(item.earningsGrowth) + "%" : "—"}</span>
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">{t("pe")}</span>
          <div className="font-medium">
            {item.trailingPE != null ? formatNum(item.trailingPE) : "—"}
            {item.forwardPE != null && (
              <span className="ml-1 text-muted-foreground">/ {formatNum(item.forwardPE)}</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">{t("peg")}</span>
          <div className="font-medium">{item.pegRatio != null ? formatNum(item.pegRatio, 2) : "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">{t("marketCap")}</span>
          <div className="font-medium">{formatMarketCap(item.marketCap, item.currency)}</div>
        </div>
      </div>
    </div>
  );
}

export function WatchlistWidget() {
  const t = useTranslations("WatchlistWidget");
  const [tickers, setTickers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTickers(JSON.parse(saved));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const saveTickers = useCallback((next: string[]) => {
    setTickers(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const addTicker = () => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed || tickers.includes(trimmed)) {
      setInput("");
      setShowInput(false);
      return;
    }
    saveTickers([...tickers, trimmed]);
    setInput("");
    setShowInput(false);
  };

  const removeTicker = useCallback(
    (ticker: string) => {
      saveTickers(tickers.filter((t) => t !== ticker));
    },
    [tickers, saveTickers]
  );

  const queryStr = tickers.join(",");
  const { data, isLoading } = useSWR<FundamentalsResult[]>(
    hydrated && tickers.length > 0 ? `/api/fundamentals?tickers=${queryStr}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t("add")}
        </button>
      </div>

      {showInput && (
        <div className="mb-3 flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTicker();
              if (e.key === "Escape") { setShowInput(false); setInput(""); }
            }}
            placeholder={t("placeholder")}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={addTicker}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("addBtn")}
          </button>
        </div>
      )}

      {tickers.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : isLoading ? (
        <div className="space-y-2">
          {tickers.map((ticker) => (
            <div key={ticker} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((item) => (
            <StockCard key={item.ticker} item={item} onRemove={removeTicker} />
          ))}
          {/* Show tickers that didn't return data */}
          {tickers
            .filter((t) => !data?.find((d) => d.ticker === t))
            .map((ticker) => (
              <div
                key={ticker}
                className="flex items-center justify-between rounded-lg border bg-card/50 p-3 text-sm"
              >
                <span className="font-medium">{ticker}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("noData")}</span>
                  <button
                    onClick={() => removeTicker(ticker)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
