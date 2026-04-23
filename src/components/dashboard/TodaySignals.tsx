"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Zap, Star, AlertTriangle, RefreshCw, Globe, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MoverItem, MoverSignal } from "@/app/api/movers/route";
import type { MarketMoverItem, MarketMoversResponse } from "@/app/api/market-movers/route";

// ─── Portfolio mover helpers ──────────────────────────────────────────────────

const SIGNAL_META: Record<MoverSignal, { label: string; color: string }> = {
  up5:       { label: "+5%↑",    color: "bg-emerald-500/20 text-emerald-300" },
  up3:       { label: "+3%↑",    color: "bg-emerald-500/15 text-emerald-400" },
  down3:     { label: "-3%↓",    color: "bg-red-500/15 text-red-400" },
  down5:     { label: "-5%↓",    color: "bg-red-500/20 text-red-300" },
  vol_spike: { label: "거래량 2x", color: "bg-orange-500/20 text-orange-300" },
  high52:    { label: "52주 고가", color: "bg-yellow-500/20 text-yellow-300" },
  low52:     { label: "52주 저가", color: "bg-purple-500/20 text-purple-300" },
};

function PortfolioMoverRow({ item }: { item: MoverItem }) {
  const isUp = item.changePct >= 0;
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors">
      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
        isUp ? "bg-emerald-500/15" : "bg-red-500/15")}>
        {isUp ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold">{item.ticker}</span>
        <span className="ml-1.5 truncate text-[11px] text-muted-foreground">{item.name}</span>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {item.signals.filter(s => !["up3","down3","up5","down5"].includes(s)).map((s) => (
            <span key={s} className={cn("rounded px-1 py-0.5 text-[9px] font-semibold", SIGNAL_META[s].color)}>
              {SIGNAL_META[s].label}
            </span>
          ))}
        </div>
      </div>
      <span className={cn("shrink-0 text-sm font-bold tabular-nums", isUp ? "text-emerald-400" : "text-red-400")}>
        {isUp ? "+" : ""}{item.changePct.toFixed(2)}%
      </span>
    </div>
  );
}

// ─── Market mover helpers ─────────────────────────────────────────────────────

function MarketRow({ item, rank }: { item: MarketMoverItem; rank?: number }) {
  const isUp = item.changePct >= 0;
  const volRatio = item.avgVolume > 0 ? item.volume / item.avgVolume : null;
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors">
      {rank !== undefined && (
        <span className="w-4 shrink-0 text-center text-[11px] text-muted-foreground font-mono">{rank}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold">{item.ticker}</span>
          <span className="truncate text-[11px] text-muted-foreground">{item.name}</span>
        </div>
        {volRatio !== null && volRatio >= 1.5 && (
          <span className="text-[9px] text-orange-400">거래량 {volRatio.toFixed(1)}x</span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-xs font-bold tabular-nums", isUp ? "text-emerald-400" : "text-red-400")}>
          {isUp ? "+" : ""}{item.changePct.toFixed(2)}%
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {item.currency === "KRW"
            ? `₩${Math.round(item.price).toLocaleString("ko-KR")}`
            : `$${item.price.toFixed(item.price < 10 ? 3 : 2)}`}
        </p>
      </div>
    </div>
  );
}

function MarketSection({
  title, items, icon, emptyMsg,
}: { title: string; items: MarketMoverItem[]; icon: React.ReactNode; emptyMsg: string }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground">
        {icon} {title}
      </p>
      {items.length === 0
        ? <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/50">{emptyMsg}</p>
        : <div className="space-y-0">{items.map((m, i) => <MarketRow key={m.ticker} item={m} rank={i + 1} />)}</div>
      }
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "portfolio" | "market";

export function TodaySignals() {
  const [tab, setTab] = useState<Tab>("market");
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [market, setMarket] = useState<MarketMoversResponse | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [portfolioDate, setPortfolioDate] = useState("");

  const loadPortfolio = async () => {
    setLoadingPortfolio(true);
    try {
      const res = await fetch("/api/movers");
      const data = await res.json();
      setMovers(data.movers ?? []);
      setPortfolioDate(data.date ?? "");
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const loadMarket = async () => {
    setLoadingMarket(true);
    try {
      const res = await fetch("/api/market-movers");
      setMarket(await res.json());
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    loadMarket();
    loadPortfolio();
  }, []);

  const gainers = movers.filter((m) => m.changePct >= 0);
  const losers  = movers.filter((m) => m.changePct < 0);
  const special = movers.filter((m) => m.signals.some((s) => ["vol_spike","high52","low52"].includes(s)));
  const loading = tab === "portfolio" ? loadingPortfolio : loadingMarket;

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">Today&apos;s Signals</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex gap-0.5 rounded-lg bg-muted/40 p-0.5">
            <button onClick={() => setTab("market")}
              className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                tab === "market" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
              <Globe className="h-3 w-3" /> 시장 전체
            </button>
            <button onClick={() => setTab("portfolio")}
              className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                tab === "portfolio" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
              <Briefcase className="h-3 w-3" /> 내 포트폴리오
            </button>
          </div>
          <button onClick={tab === "market" ? loadMarket : loadPortfolio}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Market Tab ── */}
      {tab === "market" && (
        loadingMarket && !market ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-9 rounded-lg bg-muted/30 animate-pulse" />)}</div>
        ) : market ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* US */}
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><span>🇺🇸</span> 미국</p>
              <MarketSection
                title="급등주" items={market.us.gainers}
                icon={<TrendingUp className="h-3 w-3 text-emerald-400" />}
                emptyMsg="데이터 없음" />
              <MarketSection
                title="급락주" items={market.us.losers}
                icon={<TrendingDown className="h-3 w-3 text-red-400" />}
                emptyMsg="데이터 없음" />
            </div>
            {/* KR */}
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><span>🇰🇷</span> 한국</p>
              <MarketSection
                title="급등주" items={market.kr.gainers}
                icon={<TrendingUp className="h-3 w-3 text-emerald-400" />}
                emptyMsg="데이터 없음" />
              <MarketSection
                title="급락주" items={market.kr.losers}
                icon={<TrendingDown className="h-3 w-3 text-red-400" />}
                emptyMsg="데이터 없음" />
            </div>
            {/* Most Active */}
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><span>📊</span> 거래량 상위</p>
              <MarketSection
                title="미국" items={market.us.active}
                icon={<span className="text-orange-400">🔥</span>}
                emptyMsg="데이터 없음" />
              <MarketSection
                title="한국" items={market.kr.active}
                icon={<span className="text-orange-400">🔥</span>}
                emptyMsg="데이터 없음" />
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">데이터를 불러올 수 없습니다</p>
        )
      )}

      {/* ── Portfolio Tab ── */}
      {tab === "portfolio" && (
        loadingPortfolio && movers.length === 0 ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />)}</div>
        ) : movers.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center text-muted-foreground">
            <Star className="h-8 w-8 opacity-20" />
            <p className="text-sm">오늘 눈에 띄는 움직임 없음</p>
            <p className="text-[11px] opacity-60">±2% 이상 변동 종목이 없습니다</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gainers.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-emerald-400">
                  <TrendingUp className="h-3 w-3" /> 급등 {gainers.length}
                </p>
                <div className="space-y-0">{gainers.slice(0,5).map(m => <PortfolioMoverRow key={m.ticker} item={m} />)}</div>
              </div>
            )}
            {losers.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-red-400">
                  <TrendingDown className="h-3 w-3" /> 급락 {losers.length}
                </p>
                <div className="space-y-0">{losers.slice(0,5).map(m => <PortfolioMoverRow key={m.ticker} item={m} />)}</div>
              </div>
            )}
            {special.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-orange-400">
                  <AlertTriangle className="h-3 w-3" /> 특이 시그널
                </p>
                <div className="space-y-0">{special.slice(0,5).map(m => <PortfolioMoverRow key={m.ticker} item={m} />)}</div>
              </div>
            )}
          </div>
        )
      )}

      {tab === "market" && market && (
        <p className="mt-3 text-[10px] text-muted-foreground/50">
          Yahoo Finance 기준 · 10분 캐시 · {new Date(market.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트
        </p>
      )}
      {tab === "portfolio" && portfolioDate && (
        <p className="mt-3 text-[10px] text-muted-foreground/50">{portfolioDate} 기준 · ±2% 이상 보유 종목</p>
      )}
    </div>
  );
}
