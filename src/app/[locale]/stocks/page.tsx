"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StockSearchResult } from "@/app/api/stocks/search/route";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function StocksPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    fetch(`/api/stocks/search?q=${encodeURIComponent(debouncedQuery.trim())}`)
      .then((r) => r.json())
      .then((data: StockSearchResult[]) => {
        setResults(data);
        setActiveIdx(-1);
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  const handleSelect = (result: StockSearchResult) => {
    router.push(`/stocks/${encodeURIComponent(result.ticker)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIdx >= 0 ? results[activeIdx] : results[0];
      if (target) handleSelect(target);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>종목 정보</h1>
        </div>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="종목명 또는 티커 입력 (예: AAPL, 삼성전자, 005930)"
          className="pl-9"
          autoFocus
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            검색 중...
          </div>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="max-w-lg divide-y divide-border rounded-xl border bg-card shadow-sm overflow-hidden">
          {results.map((r, idx) => (
            <li
              key={r.symbol}
              className={cn(
                "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-accent",
                idx === activeIdx && "bg-accent"
              )}
              onClick={() => handleSelect(r)}
            >
              <div>
                <div className="font-medium text-sm">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {r.ticker}
                  {r.exchange && (
                    <span className="ml-1.5 text-muted-foreground/60">{r.exchange}</span>
                  )}
                </div>
              </div>
              <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </li>
          ))}
        </ul>
      ) : query.trim().length > 0 && !loading ? (
        <div className="max-w-lg rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          검색 결과가 없습니다.
        </div>
      ) : query.trim().length === 0 ? (
        <div className="max-w-lg rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          종목명 또는 티커를 입력하세요
        </div>
      ) : null}
    </div>
  );
}
