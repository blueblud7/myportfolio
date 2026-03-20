"use client";

import { useState, useCallback } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareResult, PerfStat } from "@/app/api/compare/route";

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = "1m" | "3m" | "6m" | "1y" | "2y" | "5y";
type TabKey = "normalized" | "ratio" | "performance";

const PERIODS: { value: Period; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "2y", label: "2Y" },
  { value: "5y", label: "5Y" },
];

const PRESETS: { label: string; a: string; b: string }[] = [
  { label: "QQQ vs VOO", a: "QQQ", b: "VOO" },
  { label: "BTC-USD vs GC=F", a: "BTC-USD", b: "GC=F" },
  { label: "005930 vs 000660", a: "005930", b: "000660" },
  { label: "^IXIC vs ^GSPC", a: "^IXIC", b: "^GSPC" },
  { label: "QQQ vs BTC-USD", a: "QQQ", b: "BTC-USD" },
];

const PERF_LABELS: Record<string, string> = {
  "1w": "1주",
  "1m": "1개월",
  "3m": "3개월",
  "6m": "6개월",
  "1y": "1년",
  all: "전체",
};

// ─── Utility ────────────────────────────────────────────────────────────────

function fmtReturn(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear().toString().slice(2)}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ReturnBadge({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-block rounded font-semibold tabular-nums",
        size === "lg" ? "px-2 py-0.5 text-base" : "px-1.5 py-0.5 text-xs",
        positive
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400"
      )}
    >
      {fmtReturn(value)}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", colorClass ?? "text-zinc-100")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 rounded-xl bg-zinc-800/50" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 flex-1 rounded-lg bg-zinc-800/50" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-zinc-800/50" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800/50" />
        ))}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function NormalizedTooltip({
  active,
  payload,
  label,
  tickerA,
  tickerB,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  tickerA: string;
  tickerB: string;
}) {
  if (!active || !payload?.length) return null;
  const a = payload.find((p) => p.dataKey === "aIndexed")?.value as number | undefined;
  const b = payload.find((p) => p.dataKey === "bIndexed")?.value as number | undefined;
  const diff = a != null && b != null ? a - b : null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-zinc-300">{label}</p>
      {a != null && (
        <p className="text-blue-400">
          {tickerA}: <span className="font-bold">{a.toFixed(2)}</span>
        </p>
      )}
      {b != null && (
        <p className="text-orange-400">
          {tickerB}: <span className="font-bold">{b.toFixed(2)}</span>
        </p>
      )}
      {diff != null && (
        <p className={cn("mt-1 font-semibold", diff >= 0 ? "text-emerald-400" : "text-red-400")}>
          차이: {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
        </p>
      )}
    </div>
  );
}

function RatioTooltip({
  active,
  payload,
  label,
  tickerA,
  tickerB,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  tickerA: string;
  tickerB: string;
}) {
  if (!active || !payload?.length) return null;
  const ratio = payload[0]?.value as number | undefined;
  if (ratio == null) return null;
  const leading = ratio >= 1 ? tickerA : tickerB;
  const pct = Math.abs(ratio - 1) * 100;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-zinc-300">{label}</p>
      <p className="text-zinc-200">
        비율: <span className="font-bold">{ratio.toFixed(3)}</span>
      </p>
      <p className={cn("mt-1 font-semibold", ratio >= 1 ? "text-emerald-400" : "text-red-400")}>
        {leading} 우세 (+{pct.toFixed(1)}%)
      </p>
    </div>
  );
}

// ─── Tab: Normalized Chart + Ratio Sub-chart ────────────────────────────────

function NormalizedChart({
  data,
  tickerA,
  tickerB,
}: {
  data: CompareResult["series"];
  tickerA: string;
  tickerB: string;
}) {
  const thinned = data.length > 500 ? data.filter((_, i) => i % 2 === 0) : data;
  const SYNC = "compare-sync";
  const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };
  const YWIDTH = 52;

  const ratioMin = Math.min(...thinned.map(d => d.ratio));
  const ratioMax = Math.max(...thinned.map(d => d.ratio));
  const rPad = (ratioMax - ratioMin) * 0.1 || 0.05;

  return (
    <div className="space-y-0">
      {/* 메인: 정규화 가격 차트 */}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={thinned} margin={MARGIN} syncId={SYNC}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#71717a", fontSize: 10 }}
            interval="preserveStartEnd" minTickGap={60} hide />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}`}
            domain={["auto", "auto"]} width={YWIDTH} />
          <Tooltip content={<NormalizedTooltip tickerA={tickerA} tickerB={tickerB} />} />
          <Legend formatter={(v) => v === "aIndexed" ? tickerA : tickerB}
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
          <Line type="monotone" dataKey="aIndexed" stroke="#3b82f6" dot={false} strokeWidth={2} name="aIndexed" />
          <Line type="monotone" dataKey="bIndexed" stroke="#f97316" dot={false} strokeWidth={2} name="bIndexed" />
        </LineChart>
      </ResponsiveContainer>

      {/* 구분선 */}
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="shrink-0 text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
          A / B 비율
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {/* 서브: A/B 비율 차트 */}
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={thinned} margin={{ ...MARGIN, top: 2 }} syncId={SYNC}>
          <defs>
            <linearGradient id="ratioAbove" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ratioBelow" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#71717a", fontSize: 10 }}
            interval="preserveStartEnd" minTickGap={60} />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v) => v.toFixed(2)}
            domain={[ratioMin - rPad, ratioMax + rPad]} width={YWIDTH} />
          <Tooltip content={<RatioTooltip tickerA={tickerA} tickerB={tickerB} />} />
          <ReferenceLine y={1} stroke="#52525b" strokeDasharray="4 3" strokeWidth={1.5}
            label={{ value: "1.0", position: "insideRight", fill: "#71717a", fontSize: 9 }} />
          <Area type="monotone" dataKey="ratio" dot={false} strokeWidth={1.5}
            stroke="#a3a3a3"
            fill="url(#ratioAbove)"
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div className="flex items-center justify-end gap-4 pt-1 text-[10px] text-zinc-600">
        <span><span className="font-semibold text-emerald-500">▲ 1.0 위</span> = {tickerA} 우세</span>
        <span><span className="font-semibold text-red-500">▼ 1.0 아래</span> = {tickerB} 우세</span>
      </div>
    </div>
  );
}

// ─── Tab: Ratio Chart ────────────────────────────────────────────────────────

function RatioChart({
  data,
  tickerA,
  tickerB,
}: {
  data: CompareResult["series"];
  tickerA: string;
  tickerB: string;
}) {
  const thinned = data.length > 500 ? data.filter((_, i) => i % 2 === 0) : data;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        1.0 위 = <span className="text-emerald-400">{tickerA} 우세</span>
        &nbsp;·&nbsp; 1.0 아래 = <span className="text-red-400">{tickerB} 우세</span>
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={thinned} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ratioGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fill: "#71717a", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(v) => v.toFixed(2)}
            domain={["auto", "auto"]}
            width={52}
          />
          <Tooltip
            content={
              <RatioTooltip tickerA={tickerA} tickerB={tickerB} />
            }
          />
          <ReferenceLine
            y={1}
            stroke="#71717a"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="ratio"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#ratioGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Tab: Performance Table ──────────────────────────────────────────────────

function PerformanceTable({
  performance,
  tickerA,
  tickerB,
}: {
  performance: Record<string, PerfStat>;
  tickerA: string;
  tickerB: string;
}) {
  const orderedKeys = ["1w", "1m", "3m", "6m", "1y", "all"].filter(
    (k) => k in performance
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="pb-2 text-left text-xs font-semibold text-zinc-500">기간</th>
            <th className="pb-2 text-right text-xs font-semibold text-blue-400">{tickerA}</th>
            <th className="pb-2 text-right text-xs font-semibold text-orange-400">{tickerB}</th>
            <th className="pb-2 text-right text-xs font-semibold text-zinc-500">차이 (A−B)</th>
            <th className="pb-2 text-right text-xs font-semibold text-zinc-500">우세</th>
          </tr>
        </thead>
        <tbody>
          {orderedKeys.map((key) => {
            const stat = performance[key];
            return (
              <tr key={key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2.5 pr-4 text-xs font-medium text-zinc-400">
                  {PERF_LABELS[key] ?? key}
                </td>
                <td className="py-2.5 text-right">
                  <ReturnBadge value={stat.a} />
                </td>
                <td className="py-2.5 text-right">
                  <ReturnBadge value={stat.b} />
                </td>
                <td
                  className={cn(
                    "py-2.5 text-right text-xs font-semibold tabular-nums",
                    stat.diff > 0
                      ? "text-emerald-400"
                      : stat.diff < 0
                      ? "text-red-400"
                      : "text-zinc-500"
                  )}
                >
                  {stat.diff >= 0 ? "+" : ""}{stat.diff.toFixed(2)}%
                </td>
                <td className="py-2.5 text-right">
                  {stat.leader === "a" ? (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-bold text-blue-400">
                      {tickerA}
                    </span>
                  ) : stat.leader === "b" ? (
                    <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-bold text-orange-400">
                      {tickerB}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-500">동률</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [inputA, setInputA] = useState("QQQ");
  const [inputB, setInputB] = useState("VOO");
  const [period, setPeriod] = useState<Period>("1y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("normalized");

  const runCompare = useCallback(
    async (a: string, b: string, p: Period) => {
      if (!a.trim() || !b.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/compare?a=${encodeURIComponent(a.trim().toUpperCase())}&b=${encodeURIComponent(b.trim().toUpperCase())}&period=${p}`
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "알 수 없는 오류가 발생했습니다.");
          setResult(null);
        } else {
          setResult(json as CompareResult);
        }
      } catch {
        setError("네트워크 오류가 발생했습니다.");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleCompare = () => runCompare(inputA, inputB, period);

  const handlePreset = (a: string, b: string) => {
    setInputA(a);
    setInputB(b);
    runCompare(a, b, period);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCompare();
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "normalized", label: "정규화 차트" },
    { key: "ratio", label: "상대강도 비율" },
    { key: "performance", label: "기간별 성과" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
          <GitCompare className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">상대강도 비교</h1>
          <p className="text-sm text-zinc-500">두 자산의 상대적 성과를 비교합니다</p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        {/* Ticker inputs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-500">
              자산 A
            </label>
            <input
              type="text"
              value={inputA}
              onChange={(e) => setInputA(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="예: QQQ, 005930"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
            />
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-400">
            VS
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-500">
              자산 B
            </label>
            <input
              type="text"
              value={inputB}
              onChange={(e) => setInputB(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="예: VOO, 000660"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
            />
          </div>
        </div>

        {/* Period + button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/80 p-1">
            {PERIODS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-semibold transition",
                  period === value
                    ? "bg-blue-500 text-white shadow"
                    : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCompare}
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-500 disabled:opacity-60"
          >
            <GitCompare className="h-4 w-4" />
            {loading ? "분석 중..." : "비교하기"}
          </button>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset.a, preset.b)}
              className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && <Skeleton />}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-4">
          {/* Hero bar */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-blue-400">{result.a.ticker}</span>
                <span className="text-xs text-zinc-600">vs</span>
                <span className="text-lg font-bold text-orange-400">{result.b.ticker}</span>
              </div>

              {result.leader !== "tie" && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-bold",
                    result.leader === "a"
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-orange-500/20 text-orange-300"
                  )}
                >
                  {result.leader === "a" ? result.a.ticker : result.b.ticker} 우세
                </span>
              )}
              {result.leader === "tie" && (
                <span className="rounded-full bg-zinc-700/40 px-2.5 py-0.5 text-xs font-bold text-zinc-400">
                  동률
                </span>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">{result.a.ticker}</span>
                  <ReturnBadge value={result.totalReturnA} size="lg" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">{result.b.ticker}</span>
                  <ReturnBadge value={result.totalReturnB} size="lg" />
                </div>
              </div>
            </div>

            <div className="mt-1.5 flex gap-1 text-xs text-zinc-600">
              <span>{result.a.name}</span>
              <span>·</span>
              <span>{result.b.name}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex gap-1 border-b border-zinc-800 pb-3">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    activeTab === tab.key
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "normalized" && (
              <NormalizedChart
                data={result.series}
                tickerA={result.a.ticker}
                tickerB={result.b.ticker}
              />
            )}
            {activeTab === "ratio" && (
              <RatioChart
                data={result.series}
                tickerA={result.a.ticker}
                tickerB={result.b.ticker}
              />
            )}
            {activeTab === "performance" && (
              <PerformanceTable
                performance={result.performance}
                tickerA={result.a.ticker}
                tickerB={result.b.ticker}
              />
            )}
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="상관계수"
              value={result.correlation.toFixed(3)}
              sub="일간 수익률 기준"
              colorClass={
                Math.abs(result.correlation) > 0.8
                  ? "text-emerald-400"
                  : Math.abs(result.correlation) > 0.5
                  ? "text-yellow-400"
                  : "text-zinc-100"
              }
            />
            <StatCard
              label={`베타 (A vs B)`}
              value={result.beta.toFixed(3)}
              sub={`${result.a.ticker} 기준`}
              colorClass={
                result.beta > 1.2
                  ? "text-red-400"
                  : result.beta < 0.8
                  ? "text-blue-400"
                  : "text-zinc-100"
              }
            />
            <StatCard
              label="현재 비율"
              value={result.currentRatio.toFixed(3)}
              sub="A 인덱스 / B 인덱스"
              colorClass={
                result.currentRatio >= 1 ? "text-emerald-400" : "text-red-400"
              }
            />
            <StatCard
              label={`${result.a.ticker} 총 수익률`}
              value={fmtReturn(result.totalReturnA)}
              colorClass={
                result.totalReturnA >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
            <StatCard
              label={`${result.b.ticker} 총 수익률`}
              value={fmtReturn(result.totalReturnB)}
              colorClass={
                result.totalReturnB >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
