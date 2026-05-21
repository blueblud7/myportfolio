"use client";

import { useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import type { KrxTopStock } from "@/lib/krx";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface TopStocksData {
  foreign: KrxTopStock[];
  institution: KrxTopStock[];
}

function fmtVal(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000) return `${(v / 100_000).toFixed(1)}조`;
  if (abs >= 100) return `${(v / 100).toFixed(0)}억`;
  return `${v.toLocaleString()}백만`;
}

function StockRow({ s, rank }: { s: KrxTopStock; rank: number }) {
  const isPos = s.netBuyVal > 0;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="w-4 text-center text-xs text-muted-foreground font-mono">{rank}</span>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm truncate">{s.name}</span>
        <span className="ml-1.5 text-xs text-muted-foreground font-mono">{s.code}</span>
      </div>
      <div className="text-right shrink-0">
        <div className={cn("text-sm font-mono tabular-nums font-semibold", isPos ? "text-emerald-400" : "text-red-400")}>
          {isPos ? "+" : ""}{fmtVal(s.netBuyVal)}
        </div>
        <div className={cn("text-xs font-mono", s.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
          {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

export function KrxMarketWidget() {
  const [tab, setTab] = useState<"foreign" | "institution">("foreign");
  const [mkt, setMkt] = useState<"STK" | "KSQ">("STK");

  const { data: foreignData, isLoading: loadingForeign } = useSWR<KrxTopStock[]>(
    `/api/krx/top-stocks?type=foreign&mkt=${mkt}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );
  const { data: instData, isLoading: loadingInst } = useSWR<KrxTopStock[]>(
    `/api/krx/top-stocks?type=institution&mkt=${mkt}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );

  const stocks = tab === "foreign" ? (foreignData ?? []) : (instData ?? []);
  const isLoading = tab === "foreign" ? loadingForeign : loadingInst;

  // 상위 5개만 (순매수 양수인 것)
  const topBuy = stocks.filter(s => s.netBuyVal > 0).slice(0, 8);
  const topSell = stocks.filter(s => s.netBuyVal < 0).slice(-5).reverse();

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span className="card-title">투자자별 순매수</span>
          <span className="text-xs text-muted-foreground font-normal">KRX 공식</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 시장 선택 */}
          <div className="seg seg-sm">
            {(["STK", "KSQ"] as const).map(m => (
              <button key={m} className={cn("seg-btn", mkt === m && "active")} onClick={() => setMkt(m)}>
                {m === "STK" ? "코스피" : "코스닥"}
              </button>
            ))}
          </div>
          {/* 투자자 선택 */}
          <div className="seg seg-sm">
            {(["foreign", "institution"] as const).map(t => (
              <button key={t} className={cn("seg-btn", tab === t && "active")} onClick={() => setTab(t)}>
                {t === "foreign" ? "외국인" : "기관"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card-body card-body-padded">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-9 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : topBuy.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">데이터 없음 (장 종료 후 또는 API 오류)</p>
        ) : (
          <div className="space-y-0">
            <p className="text-xs text-muted-foreground mb-1">순매수 상위</p>
            {topBuy.map((s, i) => <StockRow key={s.code} s={s} rank={i + 1} />)}
            {topSell.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mt-3 mb-1">순매도 상위</p>
                {topSell.map((s, i) => <StockRow key={s.code} s={s} rank={i + 1} />)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
