"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import { useHoldings } from "@/hooks/use-api";
import {
  LineChart, Line, Tooltip, ResponsiveContainer, ReferenceLine, YAxis,
} from "recharts";
import { Plus, X, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from "lucide-react";
import type { VolatilityResult } from "@/app/api/volatility/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ──────────────────────────────────────────────
// Color helpers
// ──────────────────────────────────────────────
function hvColor(pct: number): string {
  if (pct >= 80) return "text-red-400";
  if (pct >= 60) return "text-orange-400";
  if (pct >= 40) return "text-yellow-400";
  if (pct >= 20) return "text-green-400";
  return "text-blue-400";
}
function hvBg(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 60) return "bg-orange-500";
  if (pct >= 40) return "bg-yellow-500";
  if (pct >= 20) return "bg-green-500";
  return "bg-blue-500";
}
function hvLabel(pct: number): string {
  if (pct >= 80) return "매우 높음";
  if (pct >= 60) return "높음";
  if (pct >= 40) return "보통";
  if (pct >= 20) return "낮음";
  return "매우 낮음";
}

// ──────────────────────────────────────────────
// Percentile gauge bar
// ──────────────────────────────────────────────
function PercentileBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-all ${hvBg(pct)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// Mini sparkline for HV history
// ──────────────────────────────────────────────
function HvSparkline({
  series,
  currentHv,
  meanHv,
}: {
  series: { date: string; hv: number }[];
  currentHv: number;
  meanHv: number;
}) {
  if (!series.length) return null;
  return (
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={series} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
            padding: "2px 8px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${(v as number).toFixed(1)}%`, "HV20"]}
          labelFormatter={(l) => l}
        />
        <ReferenceLine y={meanHv} stroke="#6b7280" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine
          y={currentHv}
          stroke="hsl(var(--primary))"
          strokeDasharray="2 2"
          strokeWidth={1}
        />
        <Line
          type="monotone"
          dataKey="hv"
          dot={false}
          strokeWidth={1.5}
          stroke="#60a5fa"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Single card
// ──────────────────────────────────────────────
function VolCard({ item }: { item: VolatilityResult }) {
  const [expanded, setExpanded] = useState(false);
  const isUp = item.changePct >= 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold">{item.ticker}</span>
            <span
              className={`text-xs font-medium ${isUp ? "text-green-500" : "text-red-500"}`}
            >
              {isUp ? "+" : ""}{item.changePct.toFixed(2)}%
            </span>
            <span className={`ml-auto text-xs font-semibold ${hvColor(item.hvPct20)}`}>
              {hvLabel(item.hvPct20)}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{item.name}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Main metrics row */}
      <div className="grid grid-cols-2 gap-px border-t bg-border">
        {/* HV20 */}
        <div className="bg-card px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">HV 20일</span>
            <span className={`text-sm font-bold ${hvColor(item.hvPct20)}`}>
              {item.hv20.toFixed(1)}%
            </span>
          </div>
          <PercentileBar value={item.hvPct20} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Rank {item.hvRank20.toFixed(0)}%</span>
            <span>Pct {item.hvPct20.toFixed(0)}%</span>
          </div>
        </div>
        {/* HV60 */}
        <div className="bg-card px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">HV 60일</span>
            <span className={`text-sm font-bold ${hvColor(item.hvPct60)}`}>
              {item.hv60.toFixed(1)}%
            </span>
          </div>
          <PercentileBar value={item.hvPct60} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Rank {item.hvRank60.toFixed(0)}%</span>
            <span>Pct {item.hvPct60.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Range stats */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">1년 최저</p>
              <p className="font-semibold text-blue-400">{item.hv20Min.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">1년 평균</p>
              <p className="font-semibold text-muted-foreground">{item.hv20Mean.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">1년 최고</p>
              <p className="font-semibold text-red-400">{item.hv20Max.toFixed(1)}%</p>
            </div>
          </div>

          {/* Interpretation */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <p>
              현재 HV20 <span className={`font-semibold ${hvColor(item.hvPct20)}`}>{item.hv20.toFixed(1)}%</span>는
              지난 1년 중 <span className="font-semibold text-foreground">{item.hvPct20.toFixed(0)}%</span>의 날보다 높은 변동성입니다.
            </p>
            {item.hvPct20 >= 80 && (
              <p className="text-orange-400">⚠ 변동성이 역사적으로 매우 높은 구간 — 포지션 리스크 관리 권장</p>
            )}
            {item.hvPct20 <= 20 && (
              <p className="text-blue-400">💤 변동성이 역사적으로 매우 낮은 구간 — 큰 움직임 전 압축 구간일 수 있음</p>
            )}
          </div>

          {/* Sparkline */}
          <div>
            <p className="mb-1 text-[10px] text-muted-foreground">HV20 추이 (최근 60 거래일)</p>
            <HvSparkline
              series={item.hv20Series}
              currentHv={item.hv20}
              meanHv={item.hv20Mean}
            />
            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 bg-blue-400" /> HV20
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 bg-muted-foreground" style={{ borderTop: "1px dashed" }} /> 1년 평균
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Table view
// ──────────────────────────────────────────────
type SortKey = "ticker" | "hv20" | "hvRank20" | "hvPct20" | "hv60" | "hvPct60";

function TableView({ items }: { items: VolatilityResult[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("hvPct20");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [items, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-right text-xs font-medium text-muted-foreground hover:text-foreground first:text-left"
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === k ? (
          sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : null}
      </span>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <Th k="ticker" label="종목" />
            <Th k="hv20" label="HV20 (%)" />
            <Th k="hvRank20" label="Rank" />
            <Th k="hvPct20" label="Pct" />
            <Th k="hv60" label="HV60 (%)" />
            <Th k="hvPct60" label="Pct60" />
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              상태
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">
              추이
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((item) => (
            <tr key={item.ticker} className="hover:bg-muted/20">
              <td className="px-3 py-2">
                <div className="font-semibold">{item.ticker}</div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.name}</div>
              </td>
              <td className={`px-3 py-2 text-right font-mono font-semibold ${hvColor(item.hvPct20)}`}>
                {item.hv20.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-16">
                    <PercentileBar value={item.hvRank20} />
                  </div>
                  <span className="text-xs w-8 text-right">{item.hvRank20.toFixed(0)}%</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-16">
                    <PercentileBar value={item.hvPct20} />
                  </div>
                  <span className="text-xs w-8 text-right">{item.hvPct20.toFixed(0)}%</span>
                </div>
              </td>
              <td className={`px-3 py-2 text-right font-mono ${hvColor(item.hvPct60)}`}>
                {item.hv60.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right text-xs">
                {item.hvPct60.toFixed(0)}%
              </td>
              <td className="px-3 py-2 text-right">
                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${hvColor(item.hvPct20)}`}>
                  {item.hvPct20 >= 60 ? <TrendingUp className="h-2.5 w-2.5" /> :
                   item.hvPct20 <= 30 ? <TrendingDown className="h-2.5 w-2.5" /> :
                   <Minus className="h-2.5 w-2.5" />}
                  {hvLabel(item.hvPct20)}
                </span>
              </td>
              <td className="px-3 py-2 w-28">
                {item.hv20Series.length > 0 && (
                  <ResponsiveContainer width="100%" height={30}>
                    <LineChart data={item.hv20Series} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <YAxis domain={["auto", "auto"]} hide />
                      <Line
                        type="monotone"
                        dataKey="hv"
                        dot={false}
                        strokeWidth={1.5}
                        stroke="#60a5fa"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
type ViewMode = "card" | "table";

export default function VolatilityPage() {
  const { data: holdings } = useHoldings();
  const [extraTickers, setExtraInput] = useState("");
  const [manualTickers, setManualTickers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const initialised = useRef(false);

  // Derive tickers from holdings + manual list
  const holdingTickers = useMemo(() => {
    if (!Array.isArray(holdings)) return [];
    return [
      ...new Set(
        (holdings as { ticker: string; manual_price: number | null }[])
          .filter((h) => h.ticker !== "CASH" && !h.manual_price)
          .map((h) => h.ticker)
      ),
    ];
  }, [holdings]);

  const allTickers = useMemo(
    () => [...new Set([...holdingTickers, ...manualTickers])],
    [holdingTickers, manualTickers]
  );

  const queryKey = allTickers.length > 0
    ? `/api/volatility?tickers=${allTickers.join(",")}`
    : null;

  const { data, isLoading, mutate } = useSWR<VolatilityResult[]>(queryKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 900_000, // 15 min cache
  });

  // Load saved manual tickers from localStorage
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    try {
      const saved = localStorage.getItem("vol_manual_tickers");
      if (saved) setManualTickers(JSON.parse(saved));
    } catch { /**/ }
  }, []);

  const saveTickers = (tickers: string[]) => {
    setManualTickers(tickers);
    try { localStorage.setItem("vol_manual_tickers", JSON.stringify(tickers)); } catch { /**/ }
  };

  const addManual = () => {
    const parts = extraTickers
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !allTickers.includes(t));
    if (parts.length > 0) {
      saveTickers([...manualTickers, ...parts]);
    }
    setExtraInput("");
  };

  const removeManual = (t: string) => saveTickers(manualTickers.filter((x) => x !== t));

  // Sort by hvPct20 descending for overview
  const sorted = useMemo(
    () => (data ?? []).sort((a, b) => b.hvPct20 - a.hvPct20),
    [data]
  );

  // Summary stats
  const avgPct = sorted.length
    ? sorted.reduce((s, d) => s + d.hvPct20, 0) / sorted.length
    : 0;
  const highVolCount = sorted.filter((d) => d.hvPct20 >= 60).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">변동성 분석</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            HV Rank & Percentile — 현재 변동성이 1년 역사 중 몇 번째인지 확인
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "card" ? "table" : "card")}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {viewMode === "card" ? "테이블 뷰" : "카드 뷰"}
          </button>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" />
            새로고침
          </button>
        </div>
      </div>

      {/* Ticker input */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={extraTickers}
            onChange={(e) => setExtraInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            placeholder="추가 종목 입력 (예: TSLA, NVDA) — Enter 또는 추가 클릭"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={addManual}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
            추가
          </button>
        </div>
        {/* Tag list */}
        <div className="flex flex-wrap gap-1.5">
          {holdingTickers.map((t) => (
            <span key={t} className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">
              {t}
              <span className="ml-1 text-[10px] text-muted-foreground">보유</span>
            </span>
          ))}
          {manualTickers.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
              {t}
              <button onClick={() => removeManual(t)}>
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">분석 종목</p>
            <p className="text-2xl font-bold mt-1">{sorted.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">평균 HV Pct</p>
            <p className={`text-2xl font-bold mt-1 ${hvColor(avgPct)}`}>
              {avgPct.toFixed(0)}%
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">고변동성 종목 (Pct≥60)</p>
            <p className={`text-2xl font-bold mt-1 ${highVolCount > 0 ? "text-orange-400" : "text-green-500"}`}>
              {highVolCount}개
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-sm">보유 종목이 없거나 데이터를 불러오는 중입니다.</p>
          <p className="text-xs mt-1">위에서 종목 ticker를 추가하거나 계좌에 종목을 등록해 주세요.</p>
        </div>
      ) : viewMode === "table" ? (
        <TableView items={sorted} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((item) => (
            <VolCard key={item.ticker} item={item} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border bg-card/50 p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground text-sm mb-2">용어 설명</p>
        <p><span className="font-medium text-foreground">HV20/HV60</span> — 20일/60일 역사적 변동성 (연율화 %). 주가의 일간 log 수익률 표준편차 × √252</p>
        <p><span className="font-medium text-foreground">HV Rank</span> — (현재 HV - 1년 최저) / (1년 최고 - 1년 최저) × 100. 최고치 대비 위치</p>
        <p><span className="font-medium text-foreground">HV Percentile</span> — 지난 1년 중 현재보다 낮은 HV였던 날의 비율. 80% = 80%의 날보다 변동성이 높음</p>
        <div className="flex flex-wrap gap-3 mt-2">
          {[
            { label: "매우 낮음", color: "text-blue-400", range: "0–20%" },
            { label: "낮음", color: "text-green-400", range: "20–40%" },
            { label: "보통", color: "text-yellow-400", range: "40–60%" },
            { label: "높음", color: "text-orange-400", range: "60–80%" },
            { label: "매우 높음", color: "text-red-400", range: "80–100%" },
          ].map((d) => (
            <span key={d.label} className={`${d.color} font-medium`}>
              {d.label} <span className="text-muted-foreground">({d.range})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
