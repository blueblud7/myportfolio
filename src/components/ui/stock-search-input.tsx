"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StockSearchResult } from "@/app/api/stocks/search/route";

interface Props {
  onSelect: (result: StockSearchResult) => void;
  defaultValue?: string;
  placeholder?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function StockSearchInput({ onSelect, defaultValue = "", placeholder }: Props) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // 검색 실행
  useEffect(() => {
    if (debouncedQuery.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    // CASH / 현금 입력 시 바로 현금 옵션 표시
    if (/^(cash|현금)$/i.test(debouncedQuery.trim())) {
      const cashOption: StockSearchResult = { ticker: "CASH", name: "현금", exchange: "", symbol: "CASH" };
      setResults([cashOption]);
      setOpen(true);
      setActiveIdx(-1);
      return;
    }

    setLoading(true);
    fetch(`/api/stocks/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: StockSearchResult[]) => {
        setResults(data);
        setOpen(data.length > 0);
        setActiveIdx(-1);
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback(
    (result: StockSearchResult) => {
      setQuery(result.ticker);
      setOpen(false);
      onSelect(result);
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "종목코드 또는 종목명 검색"}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          검색 중...
        </div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {results.map((r, idx) => (
            <li
              key={r.symbol}
              className={cn(
                "flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-accent",
                idx === activeIdx && "bg-accent"
              )}
              onMouseDown={() => handleSelect(r)}
            >
              <span className="font-medium">{r.name}</span>
              <span className="ml-3 shrink-0 font-mono text-xs text-muted-foreground">
                {r.ticker}
                {r.exchange && (
                  <span className="ml-1 text-muted-foreground/60">{r.exchange}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
