"use client";

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
} from "recharts";
import type { KrxTopStock } from "@/lib/krx";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface MarketStats {
  market: string;
  totalMarketCap: number;
  totalTradingValue: number;
  advancing: number;
  declining: number;
  unchanged: number;
  stockCount: number;
  weightedPer: number | null;
  weightedPbr: number | null;
  avgDivYield: number | null;
  sectors: { name: string; changePct: number; marketCap: number; count: number }[];
  topGainers: { code: string; name: string; changePct: number; close: number }[];
  topLosers: { code: string; name: string; changePct: number; close: number }[];
  mostTraded: { code: string; name: string; tradingValue: number; changePct: number }[];
}

interface KrxStatsResponse {
  kospi: MarketStats;
  kosdaq: MarketStats;
  updatedAt: string;
}

function fmtCap(v: number): string {
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}조`;
  return `${v.toLocaleString()}억`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AdvanceDeclineBar({ advancing, declining, unchanged, total }: { advancing: number; declining: number; unchanged: number; total: number }) {
  const upPct = (advancing / total) * 100;
  const dnPct = (declining / total) * 100;
  const ucPct = (unchanged / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex rounded-full overflow-hidden h-3">
        <div className="bg-emerald-500" style={{ width: `${upPct}%` }} title={`상승 ${advancing}종목`} />
        <div className="bg-muted" style={{ width: `${ucPct}%` }} title={`보합 ${unchanged}종목`} />
        <div className="bg-red-500" style={{ width: `${dnPct}%` }} title={`하락 ${declining}종목`} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-emerald-400">상승 {advancing}</span>
        <span className="text-muted-foreground">보합 {unchanged}</span>
        <span className="text-red-400">하락 {declining}</span>
      </div>
    </div>
  );
}

function SectorChart({ sectors }: { sectors: MarketStats["sectors"] }) {
  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct).slice(0, 15);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
        />
        <YAxis type="category" dataKey="name" width={70} tick={{ fill: "var(--fg-3)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Tooltip
          contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(2)}%`, "등락률"]}
        />
        <Bar dataKey="changePct" radius={[0, 3, 3, 0]} maxBarSize={14}
          fill="var(--accent)"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={{ position: "right", fill: "var(--fg-4)", fontSize: 10, formatter: (v: any) => `${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(1)}%` }}
        >
          {sorted.map((_, i) => (
            <rect key={i} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopStocksTable({ title, stocks, valueKey, valueLabel, color }: {
  title: string;
  stocks: { code: string; name: string; changePct?: number; close?: number; tradingValue?: number }[];
  valueKey: "changePct" | "tradingValue";
  valueLabel: string;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{title}</p>
      <div className="space-y-0">
        {stocks.slice(0, 8).map((s, i) => (
          <div key={s.code} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
            <span className="w-4 text-center text-xs text-muted-foreground font-mono">{i + 1}</span>
            <a href={`/stocks/${s.code}`} className="flex-1 min-w-0 hover:text-accent transition-colors">
              <span className="text-sm font-medium truncate">{s.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground font-mono">{s.code}</span>
            </a>
            <span className={cn("text-sm font-mono tabular-nums font-semibold shrink-0", color)}>
              {valueKey === "changePct"
                ? `${(s.changePct ?? 0) > 0 ? "+" : ""}${(s.changePct ?? 0).toFixed(2)}%`
                : `${fmtCap(s.tradingValue ?? 0)}`
              }
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestorTopStocks() {
  const [type, setType] = useState<"foreign" | "institution">("foreign");
  const [mkt, setMkt] = useState<"STK" | "KSQ">("STK");

  const { data, isLoading } = useSWR<KrxTopStock[]>(
    `/api/krx/top-stocks?type=${type}&mkt=${mkt}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );

  const topBuy = (data ?? []).filter(s => s.netBuyVal > 0).slice(0, 10);
  const topSell = (data ?? []).filter(s => s.netBuyVal < 0).slice(-5).reverse();

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">투자자별 순매수 상위</span>
        <div className="flex items-center gap-2">
          <div className="seg seg-sm">
            {(["STK", "KSQ"] as const).map(m => (
              <button key={m} className={cn("seg-btn", mkt === m && "active")} onClick={() => setMkt(m)}>
                {m === "STK" ? "코스피" : "코스닥"}
              </button>
            ))}
          </div>
          <div className="seg seg-sm">
            {(["foreign", "institution"] as const).map(t => (
              <button key={t} className={cn("seg-btn", type === t && "active")} onClick={() => setType(t)}>
                {t === "foreign" ? "외국인" : "기관"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-body card-body-padded">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-9 animate-pulse rounded bg-muted/30" />)}
          </div>
        ) : topBuy.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-2">순매수 상위</p>
              {topBuy.map((s, i) => (
                <div key={s.code} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
                  <span className="w-4 text-center text-xs text-muted-foreground font-mono">{i + 1}</span>
                  <a href={`/stocks/${s.code}`} className="flex-1 min-w-0 hover:text-accent transition-colors">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="ml-1 text-xs text-muted-foreground font-mono">{s.code}</span>
                  </a>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono text-emerald-400 font-semibold">
                      +{(s.netBuyVal / 100).toFixed(0)}억
                    </div>
                    <div className={cn("text-xs font-mono", s.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {topSell.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-400 mb-2">순매도 상위</p>
                {topSell.map((s, i) => (
                  <div key={s.code} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
                    <span className="w-4 text-center text-xs text-muted-foreground font-mono">{i + 1}</span>
                    <a href={`/stocks/${s.code}`} className="flex-1 min-w-0 hover:text-accent transition-colors">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="ml-1 text-xs text-muted-foreground font-mono">{s.code}</span>
                    </a>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono text-red-400 font-semibold">
                        {(s.netBuyVal / 100).toFixed(0)}억
                      </div>
                      <div className={cn("text-xs font-mono", s.changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketSection({ stats, isLoading }: { stats: MarketStats | undefined; isLoading: boolean }) {
  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 지표 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="시가총액"
          value={fmtCap(stats.totalMarketCap)}
          sub="원"
        />
        <StatCard
          label="거래대금"
          value={fmtCap(stats.totalTradingValue)}
          sub="원"
        />
        <StatCard
          label="PER (시총가중)"
          value={stats.weightedPer != null ? `${stats.weightedPer.toFixed(1)}배` : "—"}
          sub={`PBR ${stats.weightedPbr?.toFixed(2) ?? "—"}배`}
        />
        <StatCard
          label="평균 배당수익률"
          value={stats.avgDivYield != null ? `${stats.avgDivYield.toFixed(2)}%` : "—"}
          sub={`상장 ${stats.stockCount.toLocaleString()}종목`}
        />
      </div>

      {/* 등락 현황 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">시장 등락 현황</span>
        </div>
        <div className="card-body card-body-padded">
          <AdvanceDeclineBar
            advancing={stats.advancing}
            declining={stats.declining}
            unchanged={stats.unchanged}
            total={stats.stockCount}
          />
        </div>
      </div>

      {/* 업종별 등락률 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">업종별 등락률</span>
          <span className="text-xs text-muted-foreground">{stats.market} 업종 분류</span>
        </div>
        <div className="card-body card-body-padded">
          <SectorChart sectors={stats.sectors} />
        </div>
      </div>

      {/* 상위/하위 종목 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">등락 상위 종목</span>
        </div>
        <div className="card-body card-body-padded">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TopStocksTable
              title="상승 상위"
              stocks={stats.topGainers}
              valueKey="changePct"
              valueLabel="등락률"
              color="text-emerald-400"
            />
            <TopStocksTable
              title="하락 상위"
              stocks={stats.topLosers}
              valueKey="changePct"
              valueLabel="등락률"
              color="text-red-400"
            />
            <TopStocksTable
              title="거래대금 상위"
              stocks={stats.mostTraded}
              valueKey="tradingValue"
              valueLabel="거래대금"
              color="text-blue-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function KrxMarketPage() {
  const [market, setMarket] = useState<"kospi" | "kosdaq">("kospi");

  const { data, isLoading, mutate } = useSWR<KrxStatsResponse>(
    "/api/krx/market-stats",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );

  const stats = data?.[market];
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>한국 시장</h1>
        </div>
        <div className="right">
          {updatedAt && (
            <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
              {updatedAt} 기준
            </span>
          )}
          <button className="btn" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            갱신
          </button>
        </div>
      </div>

      {/* 시장 탭 */}
      <div className="seg">
        {(["kospi", "kosdaq"] as const).map(m => (
          <button key={m} className={cn("seg-btn", market === m && "active")} onClick={() => setMarket(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <MarketSection stats={stats} isLoading={isLoading} />

      {/* 투자자별 순매수 */}
      <InvestorTopStocks />

      <p className="text-xs text-muted-foreground text-center">
        KRX (한국거래소) 공식 데이터 · 장 종료 후 확정 수치 · 30분 캐시
      </p>
    </div>
  );
}
