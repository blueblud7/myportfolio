"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { RefreshCw, TrendingUp, TrendingDown, Activity, Calendar, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot,
} from "recharts";
import type { BacktestEntry, BacktestStats, MarketEvent, IndexSymbol } from "@/lib/market-timing";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface BacktestResponse {
  params: { indicator: string; direction: string; threshold: number; hold: number; indexKey: string; cooldown: number };
  indexLabel: string;
  entries: BacktestEntry[];
  stats: BacktestStats;
  indicatorRange: { from: string; to: string } | null;
}
interface ChartResponse {
  indicator: string;
  indexKey: string;
  indexLabel: string;
  points: { date: string; indicator: number; index: number | null }[];
  events: MarketEvent[];
}

// ─── 프리셋 시나리오 ──────────────────────────────────────────────────────────
const PRESETS = [
  { id: "vix-fear",  label: "VIX 공포 (>30)", desc: "VIX 30 이상 시 진입, 1개월 보유",
    params: { indicator: "vix", direction: "above", threshold: 30, hold: 30 } },
  { id: "vix-panic", label: "VIX 패닉 (>40)", desc: "VIX 40 초과(블랙스완)",
    params: { indicator: "vix", direction: "above", threshold: 40, hold: 60 } },
  { id: "vix-calm",  label: "VIX 평온 (<15)", desc: "탐욕 정점, 1개월 보유 (대조군)",
    params: { indicator: "vix", direction: "below", threshold: 15, hold: 30 } },
  { id: "fng-fear",  label: "F&G 극공포 (<25)", desc: "Extreme Fear, 1개월 보유",
    params: { indicator: "fng", direction: "below", threshold: 25, hold: 30 } },
  { id: "fng-greed", label: "F&G 극탐욕 (>75)", desc: "Extreme Greed, 1개월 보유",
    params: { indicator: "fng", direction: "above", threshold: 75, hold: 30 } },
];

const HOLD_OPTIONS = [
  { value: 5, label: "1주" },
  { value: 30, label: "1개월" },
  { value: 60, label: "2개월" },
  { value: 90, label: "3개월" },
  { value: 180, label: "6개월" },
  { value: 365, label: "1년" },
];

const INDEX_OPTIONS: { value: IndexSymbol; label: string }[] = [
  { value: "sp500", label: "S&P 500" },
  { value: "kospi", label: "KOSPI" },
  { value: "nasdaq", label: "NASDAQ" },
];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function pctColor(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";
}
function fmtPct(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }
function categoryColor(c: MarketEvent["category"]): string {
  switch (c) {
    case "crisis":      return "bg-red-900/40 text-red-300 border-red-700/40";
    case "policy":      return "bg-blue-900/40 text-blue-300 border-blue-700/40";
    case "rally":       return "bg-emerald-900/40 text-emerald-300 border-emerald-700/40";
    case "geopolitics": return "bg-amber-900/40 text-amber-300 border-amber-700/40";
  }
}
function categoryLabel(c: MarketEvent["category"]): string {
  return c === "crisis" ? "위기" : c === "policy" ? "정책" : c === "rally" ? "랠리" : "지정학";
}

// ─── 통계 카드 ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "up" | "down" | "warn" | "default" }) {
  const colorClass = accent === "up" ? "text-emerald-400"
    : accent === "down" ? "text-red-400"
    : accent === "warn" ? "text-amber-400" : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", colorClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function MarketTimingPage() {
  const [indicator, setIndicator] = useState<"vix" | "fng">("vix");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState(30);
  const [hold, setHold] = useState(30);
  const [indexKey, setIndexKey] = useState<IndexSymbol>("sp500");
  const [cooldown, setCooldown] = useState(30);
  const [activePreset, setActivePreset] = useState<string | null>("vix-fear");

  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    p.set("indicator", indicator);
    p.set("direction", direction);
    p.set("threshold", String(threshold));
    p.set("hold", String(hold));
    p.set("index", indexKey);
    p.set("cooldown", String(cooldown));
    return p.toString();
  }, [indicator, direction, threshold, hold, indexKey, cooldown]);

  const { data, isLoading, mutate } = useSWR<BacktestResponse>(
    `/api/market-timing?${queryStr}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );

  const { data: chartData } = useSWR<ChartResponse>(
    `/api/market-timing?indicator=${indicator}&index=${indexKey}&chart=1`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 }
  );

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setIndicator(preset.params.indicator as "vix" | "fng");
    setDirection(preset.params.direction as "above" | "below");
    setThreshold(preset.params.threshold);
    setHold(preset.params.hold);
    setActivePreset(preset.id);
  };

  const stats = data?.stats;
  const entries = data?.entries ?? [];

  // 차트용 정규화: indicator는 0~100, index는 % 정규화 (시작점=0)
  const chartPoints = useMemo(() => {
    if (!chartData?.points) return [];
    const points = chartData.points;
    const firstIdx = points.find(p => p.index !== null)?.index ?? 1;
    return points.map(p => ({
      date: p.date,
      indicator: p.indicator,
      indexPct: p.index !== null ? ((p.index - firstIdx) / firstIdx) * 100 : null,
    }));
  }, [chartData]);

  // 차트 위에 표시할 이벤트 마커 (차트 범위 내)
  const eventMarkers = useMemo(() => {
    if (!chartData?.points || !chartData?.events) return [];
    const dateSet = new Set(chartData.points.map(p => p.date));
    return chartData.events
      .filter(e => dateSet.has(e.date) || chartData.points.some(p => p.date >= e.date && chartData.points.indexOf(p) === chartData.points.findIndex(pp => pp.date >= e.date)))
      .map(e => {
        const point = chartData.points.find(p => p.date >= e.date);
        if (!point) return null;
        return { ...e, indicator: point.indicator };
      })
      .filter((e): e is MarketEvent & { indicator: number } => e !== null);
  }, [chartData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>시장 심리 백테스트</h1>
        </div>
        <div className="right">
          {data?.indicatorRange && (
            <span className="text-xs text-muted-foreground font-mono">
              {data.indicatorRange.from} ~ {data.indicatorRange.to}
            </span>
          )}
          <button className="btn" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            갱신
          </button>
        </div>
      </div>

      {/* 안내 */}
      <div className="rounded-xl border border-border/40 bg-surface/50 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-foreground font-medium">공포일 때 사면 정말 돈을 벌까? 과거 데이터로 검증합니다.</p>
          <p>VIX(시카고 변동성 지수) 또는 CNN Fear &amp; Greed 지수가 특정 조건을 만족할 때 인덱스를 매수해 N일 보유 시 수익률을 시뮬레이션. VIX는 5년치, F&amp;G는 약 1년치 사용.</p>
        </div>
      </div>

      {/* 프리셋 */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            title={preset.desc}
            className={cn(
              "inline-flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all min-w-[120px]",
              activePreset === preset.id
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface hover:border-accent/50 hover:bg-muted/30"
            )}
          >
            <span className="font-semibold">{preset.label}</span>
            <span className="text-[10px] text-muted-foreground font-normal">{preset.desc}</span>
          </button>
        ))}
      </div>

      {/* 컨트롤 패널 */}
      <div className="card">
        <div className="card-body card-body-padded">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">지표</label>
              <div className="seg seg-sm">
                <button className={cn("seg-btn", indicator === "vix" && "active")} onClick={() => { setIndicator("vix"); setThreshold(30); setDirection("above"); setActivePreset(null); }}>VIX</button>
                <button className={cn("seg-btn", indicator === "fng" && "active")} onClick={() => { setIndicator("fng"); setThreshold(25); setDirection("below"); setActivePreset(null); }}>F&G</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">조건</label>
              <div className="seg seg-sm">
                <button className={cn("seg-btn", direction === "above" && "active")} onClick={() => { setDirection("above"); setActivePreset(null); }}>이상</button>
                <button className={cn("seg-btn", direction === "below" && "active")} onClick={() => { setDirection("below"); setActivePreset(null); }}>이하</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">임계값</label>
              <input
                type="number"
                value={threshold}
                onChange={e => { setThreshold(Number(e.target.value)); setActivePreset(null); }}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">보유 기간</label>
              <select
                value={hold}
                onChange={e => { setHold(Number(e.target.value)); setActivePreset(null); }}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {HOLD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">인덱스</label>
              <select
                value={indexKey}
                onChange={e => setIndexKey(e.target.value as IndexSymbol)}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {INDEX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">재진입 간격</label>
              <select
                value={cooldown}
                onChange={e => setCooldown(Number(e.target.value))}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value={1}>1일</option>
                <option value={7}>1주</option>
                <option value={14}>2주</option>
                <option value={30}>1개월</option>
                <option value={60}>2개월</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 통계 카드 */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
      ) : !stats || stats.count === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium">조건을 만족하는 진입 시점이 없습니다.</p>
          <p className="text-xs text-muted-foreground mt-1">임계값을 조정하거나 재진입 간격을 줄여보세요.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="진입 횟수"
              value={stats.count.toString()}
              sub={`승 ${stats.positiveCount} / 패 ${stats.negativeCount}`}
            />
            <StatCard
              label="평균 수익률"
              value={fmtPct(stats.avgReturn)}
              sub={`중앙값 ${fmtPct(stats.median)}`}
              accent={stats.avgReturn > 0 ? "up" : "down"}
            />
            <StatCard
              label="승률"
              value={`${stats.winRate.toFixed(0)}%`}
              sub={`표준편차 ${stats.stdDev.toFixed(2)}%`}
              accent={stats.winRate >= 60 ? "up" : stats.winRate >= 40 ? "default" : "down"}
            />
            <StatCard
              label="최고 / 최저"
              value={`${fmtPct(stats.best)} / ${fmtPct(stats.worst)}`}
              sub={`${data!.indexLabel} · ${hold}일 보유`}
            />
          </div>

          {/* 결론 메시지 */}
          <div className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            stats.avgReturn > 0 && stats.winRate >= 60 ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"
              : stats.avgReturn > 0 ? "border-blue-700/40 bg-blue-900/20 text-blue-200"
              : "border-red-700/40 bg-red-900/20 text-red-200"
          )}>
            <p className="font-semibold mb-1">
              💡 결론: {indicator === "vix" ? "VIX" : "F&G"} {direction === "above" ? "≥" : "≤"} {threshold} 일 때 {data!.indexLabel} 매수 → {hold}일 후
            </p>
            <p>
              평균 <span className="font-mono font-bold">{fmtPct(stats.avgReturn)}</span> 수익,
              승률 <span className="font-mono font-bold">{stats.winRate.toFixed(0)}%</span> ({stats.positiveCount}/{stats.count}) ·
              최악의 경우 <span className="font-mono font-bold">{fmtPct(stats.worst)}</span>까지 손실 가능
            </p>
          </div>
        </>
      )}

      {/* 차트 */}
      {chartPoints.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">{indicator === "vix" ? "VIX" : "Fear & Greed"} 추이 vs {data?.indexLabel ?? "지수"} 누적수익률</span>
            <span className="text-xs text-muted-foreground">주요 사건 마커 포함</span>
          </div>
          <div className="card-body card-body-padded">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartPoints} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--fg-4)" }} tickFormatter={d => d.slice(2, 7).replace("-", "/")} minTickGap={40} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "var(--fg-4)" }} width={36} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--fg-4)" }} width={42} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, name) => {
                    const key = String(name ?? "");
                    if (key === "indicator") return [Number(v).toFixed(1), indicator === "vix" ? "VIX" : "F&G"];
                    if (key === "indexPct") return [`${Number(v).toFixed(1)}%`, data?.indexLabel ?? "지수"];
                    return [v as React.ReactNode, key];
                  }}
                />
                <ReferenceLine yAxisId="left" y={threshold} stroke="#f97316" strokeDasharray="4 2" />
                <Line yAxisId="left"  type="monotone" dataKey="indicator" stroke="#a855f7" strokeWidth={1.5} dot={false} name="indicator" />
                <Line yAxisId="right" type="monotone" dataKey="indexPct"  stroke="#10b981" strokeWidth={1.5} dot={false} name="indexPct" connectNulls />
                {eventMarkers.slice(0, 20).map((e, i) => (
                  <ReferenceDot
                    key={i}
                    yAxisId="left"
                    x={e.date}
                    y={e.indicator}
                    r={4}
                    fill={e.category === "crisis" ? "#ef4444" : e.category === "policy" ? "#3b82f6" : e.category === "rally" ? "#10b981" : "#f59e0b"}
                    stroke="white"
                    strokeWidth={1}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              주황 점선 = 임계값 {threshold} / 점 = 주요 사건 (적색=위기, 청색=정책, 녹색=랠리, 황색=지정학)
            </p>
          </div>
        </div>
      )}

      {/* 진입 내역 */}
      {entries.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">진입 내역</span>
            <span className="text-xs text-muted-foreground">{entries.length}건</span>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left">진입일</th>
                    <th className="px-3 py-2 text-right">{indicator === "vix" ? "VIX" : "F&G"}</th>
                    <th className="px-3 py-2 text-right">진입가</th>
                    <th className="px-3 py-2 text-left">청산일</th>
                    <th className="px-3 py-2 text-right">청산가</th>
                    <th className="px-3 py-2 text-right">수익률</th>
                    <th className="px-3 py-2 text-left">당시 이슈</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs">{e.date}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-semibold",
                          (indicator === "vix" && e.indicatorValue >= 40) || (indicator === "fng" && e.indicatorValue <= 15) ? "bg-red-900/40 text-red-300"
                            : (indicator === "vix" && e.indicatorValue >= 25) || (indicator === "fng" && e.indicatorValue <= 30) ? "bg-amber-900/40 text-amber-300"
                            : "bg-muted/40"
                        )}>
                          {e.indicatorValue.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{e.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.exitDate}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{e.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-bold", pctColor(e.returnPct))}>
                        {e.returnPct > 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                        {fmtPct(e.returnPct)}
                      </td>
                      <td className="px-3 py-2">
                        {e.event ? (
                          <div className="flex items-start gap-2">
                            <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border shrink-0", categoryColor(e.event.category))}>
                              {categoryLabel(e.event.category)}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-xs">{e.event.title}</div>
                              <div className="text-[11px] text-muted-foreground">{e.event.summary}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 데이터 출처 */}
      <div className="rounded-xl border border-border/40 bg-surface/50 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1 text-foreground">데이터 출처 & 주의사항</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>VIX · 인덱스 가격: Yahoo Finance (5년치, 일봉)</li>
          <li>CNN Fear &amp; Greed: production.dataviz.cnn.io (약 1년치, 일봉)</li>
          <li>주요 사건: 2020 코로나, 2022 베어마켓, 2024 엔케리 청산, 2025 트럼프 관세 등 26개 사건</li>
          <li>재진입 간격을 두어 군집 진입 방지. 인덱스 자체 매수 가정 (개별 종목 X)</li>
          <li className="text-amber-400/80">⚠️ 과거 수익률은 미래 수익률을 보장하지 않습니다. 표본이 작을수록 통계 신뢰도 ↓</li>
        </ul>
      </div>
    </div>
  );
}
