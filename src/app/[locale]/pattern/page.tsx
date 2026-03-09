"use client";

import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { GitBranch, Search, TrendingDown, TrendingUp, BarChart2, Activity } from "lucide-react";
import type { StockAnalysisResult, PatternMatch } from "@/app/api/stock-analysis/route";

// ─── Mini SVG Sparkline ────────────────────────────────────────────────────
function Sparkline({
  data,
  color = "#3b82f6",
  height = 44,
  width = 120,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) {
    return <div style={{ height, width }} className="rounded bg-zinc-800/50" />;
  }

  const PAD = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (width - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (height - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const fillPts = [
    `${PAD},${height}`,
    ...pts,
    `${(width - PAD).toFixed(1)},${height}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ height, width }}
      preserveAspectRatio="none"
      className="rounded overflow-hidden"
    >
      <polygon points={fillPts} fill={color} fillOpacity={0.15} />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
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

// ─── Loading Skeleton ──────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-zinc-800" />
      <div className="h-32 rounded-xl bg-zinc-800" />
    </div>
  );
}

// ─── Percentile label helper ───────────────────────────────────────────────
function percentileLabel(pct: number): string {
  if (pct <= 10) return `하위 ${pct}%`;
  if (pct >= 90) return `상위 ${100 - pct}%`;
  return `${pct}번째 백분위`;
}

// ─── 에피소드 테이블 (공용) ────────────────────────────────────────────────
function EpisodeTable({ data }: { data: StockAnalysisResult }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 하락 에피소드 */}
      {data.episodes.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="mb-3 text-sm font-semibold text-red-400">📉 주요 하락 에피소드 (≤-5%)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-1.5 text-left font-medium">시작</th>
                  <th className="py-1.5 text-left font-medium">저점</th>
                  <th className="py-1.5 text-right font-medium">낙폭</th>
                  <th className="py-1.5 text-right font-medium">기간</th>
                  <th className="py-1.5 text-right font-medium">회복</th>
                </tr>
              </thead>
              <tbody>
                {data.episodes.map((ep, i) => (
                  <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                    <td className="py-1.5 text-zinc-400">{ep.startDate}</td>
                    <td className="py-1.5 text-zinc-400">{ep.troughDate}</td>
                    <td className="py-1.5 text-right font-semibold text-red-400">{ep.drawdownPct.toFixed(1)}%</td>
                    <td className="py-1.5 text-right text-zinc-400">{ep.durationDays}일</td>
                    <td className="py-1.5 text-right">
                      {ep.recoveryDays != null
                        ? <span className="text-zinc-400">{ep.recoveryDays}일</span>
                        : <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-400">진행중</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 상승 에피소드 */}
      {data.runupEpisodes.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="mb-3 text-sm font-semibold text-emerald-400">📈 주요 상승 에피소드 (≥+5%)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-1.5 text-left font-medium">시작</th>
                  <th className="py-1.5 text-left font-medium">고점</th>
                  <th className="py-1.5 text-right font-medium">상승폭</th>
                  <th className="py-1.5 text-right font-medium">기간</th>
                  <th className="py-1.5 text-right font-medium">조정</th>
                </tr>
              </thead>
              <tbody>
                {data.runupEpisodes.map((ep, i) => (
                  <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                    <td className="py-1.5 text-zinc-400">{ep.startDate}</td>
                    <td className="py-1.5 text-zinc-400">{ep.peakDate}</td>
                    <td className="py-1.5 text-right font-semibold text-emerald-400">+{ep.runupPct.toFixed(1)}%</td>
                    <td className="py-1.5 text-right text-zinc-400">{ep.durationDays}일</td>
                    <td className="py-1.5 text-right">
                      {ep.declineDays != null
                        ? <span className="text-zinc-400">{ep.declineDays}일</span>
                        : <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">진행중</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: MDD + RunUp ──────────────────────────────────────────────────────
function MddTab({ data }: { data: StockAnalysisResult }) {
  const chartData = data.combinedSeries.filter((_, i) => i % 3 === 0 || i === data.combinedSeries.length - 1);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="현재 드로다운" value={`${data.currentDrawdown.toFixed(2)}%`}
          colorClass={data.currentDrawdown < -10 ? "text-red-400" : data.currentDrawdown < -5 ? "text-orange-400" : "text-zinc-100"} />
        <StatCard label="최대 드로다운 (2년)" value={`${data.maxDrawdown.toFixed(2)}%`} colorClass="text-red-400" />
        <StatCard label="현재 런업" value={`+${data.currentRunup.toFixed(2)}%`}
          colorClass={data.currentRunup > 20 ? "text-emerald-400" : data.currentRunup > 10 ? "text-emerald-300" : "text-zinc-100"} />
        <StatCard label="최대 런업 (2년)" value={`+${data.maxRunup.toFixed(2)}%`} colorClass="text-emerald-400" />
      </div>

      {/* Combined Chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="mb-1 text-sm font-semibold text-zinc-300">드로다운 / 런업 추이 (2년)</p>
        <p className="mb-3 text-xs text-zinc-600">초록=전저점 대비 상승폭 · 빨강=전고점 대비 하락폭</p>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ddGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ruGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v: string) => v.slice(0, 7)} minTickGap={50} />
            <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v: number) => `${v}%`} width={50} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: "0.5rem", border: "1px solid #3f3f46", background: "#18181b", color: "#f4f4f5" }}
              formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(2)}%`, name === "drawdown" ? "드로다운" : "런업"]}
              labelFormatter={(l) => String(l)}
            />
            <Legend formatter={(v) => v === "drawdown" ? "드로다운" : "런업"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
            <Area type="monotone" dataKey="runup" stroke="#10b981" strokeWidth={1.5} fill="url(#ruGrad)" dot={false} />
            <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad2)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <EpisodeTable data={data} />
    </div>
  );
}

// ─── 분포 바 위 "오늘" 화살표 레이블 ──────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TodayLabel(currentIdx: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function TodayLabelInner(props: any) {
    const { x, y, width, index } = props;
    if (index !== currentIdx) return null;
    const cx = x + width / 2;
    return (
      <g>
        <text x={cx} y={y - 18} textAnchor="middle" fill="#facc15" fontSize={10} fontWeight="bold">오늘</text>
        <text x={cx} y={y - 6} textAnchor="middle" fill="#facc15" fontSize={10}>▼</text>
      </g>
    );
  };
}

// ─── Tab: 수익률 분포 ──────────────────────────────────────────────────────
function ReturnDistTab({ data }: { data: StockAnalysisResult }) {
  const currentBucketIdx = data.histogram.findIndex(
    b => data.currentReturnPct >= b.min && data.currentReturnPct < b.max
  );

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="오늘 등락률"
          value={`${data.currentReturnPct >= 0 ? "+" : ""}${data.currentReturnPct.toFixed(2)}%`}
          sub={percentileLabel(data.currentReturnPercentile)}
          colorClass={data.currentReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        {data.weekReturnPct != null && (
          <StatCard
            label="주간 수익률"
            value={`${data.weekReturnPct >= 0 ? "+" : ""}${data.weekReturnPct.toFixed(2)}%`}
            sub={data.weekReturnPercentile != null ? percentileLabel(data.weekReturnPercentile) : undefined}
            colorClass={data.weekReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        )}
        <StatCard
          label="평균 일간수익률"
          value={`${data.returnStats.mean >= 0 ? "+" : ""}${data.returnStats.mean.toFixed(3)}%`}
          colorClass={data.returnStats.mean >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard
          label="표준편차"
          value={`${data.returnStats.std.toFixed(3)}%`}
          sub={`범위 ${data.returnStats.min}% ~ +${data.returnStats.max}%`}
        />
        <StatCard
          label="상승일 비율"
          value={`${data.returnStats.positive}%`}
          colorClass={data.returnStats.positive >= 50 ? "text-emerald-400" : "text-zinc-100"}
        />
      </div>

      {/* Explanation */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
        오늘{" "}
        <span className={cn("font-semibold", data.currentReturnPct >= 0 ? "text-emerald-400" : "text-red-400")}>
          {data.currentReturnPct >= 0 ? "+" : ""}
          {data.currentReturnPct.toFixed(2)}%
        </span>{" "}
        변동은 2년 일간 수익률 분포에서{" "}
        <span className="font-semibold text-blue-400">
          {percentileLabel(data.currentReturnPercentile)}
        </span>
        에 해당합니다.
      </div>

      {/* Histogram */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="mb-3 text-sm font-semibold text-zinc-300">일간 수익률 분포 (2년)</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.histogram} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#71717a" }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickFormatter={(v: number) => `${v}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: "0.5rem",
                border: "1px solid #3f3f46",
                background: "#18181b",
                color: "#f4f4f5",
              }}
              formatter={(v: unknown, _: unknown, props: { payload?: { count?: number } }) => [
                `${Number(v).toFixed(1)}% (${props.payload?.count ?? 0}일)`,
                "빈도",
              ]}
            />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
              <LabelList content={TodayLabel(currentBucketIdx)} />
              {data.histogram.map((entry, idx) => {
                const isHighlight = idx === currentBucketIdx;
                const isNeg = entry.max <= 0;
                const baseColor = isNeg ? "#ef4444" : "#10b981";
                return (
                  <Cell
                    key={idx}
                    fill={isHighlight ? "#facc15" : baseColor}
                    fillOpacity={isHighlight ? 0.9 : 0.45}
                    stroke={isHighlight ? "#facc15" : "transparent"}
                    strokeWidth={isHighlight ? 2 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Pattern match card ────────────────────────────────────────────────────
function PatternCard({ match, rank }: { match: PatternMatch; rank: number }) {
  const isPositive = match.futureReturn >= 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
            {rank}
          </span>
          <span className="text-xs text-zinc-400">
            {match.startDate} ~ {match.endDate}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
            유사도 {match.similarity.toFixed(1)}%
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              isPositive
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            이후 {isPositive ? "+" : ""}{match.futureReturn.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">패턴</p>
          <Sparkline
            data={match.patternPrices}
            color="#3b82f6"
            height={52}
            width={160}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            이후 {match.futureDays}일
          </p>
          <Sparkline
            data={match.futurePrices}
            color={isPositive ? "#10b981" : "#ef4444"}
            height={52}
            width={160}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 유사패턴 ─────────────────────────────────────────────────────────
function PatternTab({ data }: { data: StockAnalysisResult }) {
  const avgFutureReturn =
    data.patterns.length > 0
      ? data.patterns.reduce((sum, p) => sum + p.futureReturn, 0) / data.patterns.length
      : null;

  const positiveCount = data.patterns.filter(p => p.futureReturn > 0).length;

  return (
    <div className="space-y-5">
      {/* Current pattern */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="mb-1 text-sm font-semibold text-zinc-300">
          현재 패턴 (최근 {data.patternDays}일, 정규화)
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          기준점 대비 누적 수익률(%) 기준으로 패턴 형태를 비교합니다
        </p>
        <Sparkline
          data={data.currentPatternPrices}
          color="#3b82f6"
          height={80}
          width={600}
        />
      </div>

      {/* Summary */}
      {data.patterns.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="유사 패턴 수"
            value={`${data.patterns.length}개`}
            sub="가장 유사한 과거 구간"
          />
          {avgFutureReturn != null && (
            <StatCard
              label="이후 평균 수익률"
              value={`${avgFutureReturn >= 0 ? "+" : ""}${avgFutureReturn.toFixed(2)}%`}
              sub={`${data.patterns[0]?.futureDays ?? 15}일 후 기준`}
              colorClass={avgFutureReturn >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          )}
          <StatCard
            label="상승 비율"
            value={`${positiveCount} / ${data.patterns.length}`}
            sub={`${Math.round((positiveCount / data.patterns.length) * 100)}%`}
            colorClass={positiveCount >= data.patterns.length / 2 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
      )}

      {/* Pattern list */}
      {data.patterns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-zinc-500">
          <Activity className="h-10 w-10 opacity-30" />
          <p className="text-sm">충분한 데이터가 없어 유사 패턴을 찾을 수 없습니다.</p>
          <p className="text-xs">패턴 일수를 줄이거나 다른 종목을 시도해보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.patterns.map((match, i) => (
            <PatternCard key={i} match={match} rank={i + 1} />
          ))}
        </div>
      )}

      {data.patterns.length > 0 && (
        <p className="text-xs text-zinc-600">
          * 과거 패턴 유사도는 정규화된 가격 형태 기반 유클리드 거리로 측정합니다. 투자 판단의 근거가 아닙니다.
        </p>
      )}
    </div>
  );
}

// ─── Popular Tickers ───────────────────────────────────────────────────────
const POPULAR_TICKERS = ["AAPL", "NVDA", "005930", "000660", "TSLA"];

// ─── Main Page ─────────────────────────────────────────────────────────────
type TabId = "mdd" | "dist" | "pattern";

export default function PatternPage() {
  const [ticker, setTicker] = useState("");
  const [days, setDays] = useState<number>(20);
  const [submitted, setSubmitted] = useState<{ ticker: string; days: number } | null>(null);
  const [data, setData] = useState<StockAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("mdd");

  const analyze = async (t = ticker, d = days) => {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSubmitted({ ticker: clean, days: d });
    try {
      const res = await fetch(`/api/stock-analysis?ticker=${encodeURIComponent(clean)}&days=${d}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "분석 실패");
      setData(json as StockAnalysisResult);
      setActiveTab("mdd");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "mdd", label: "MDD" },
    { id: "dist", label: "수익률 분포" },
    { id: "pattern", label: "유사패턴" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
          <GitBranch className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">패턴 분석</h1>
          <p className="text-sm text-zinc-500">
            MDD · 수익률 분포 · 과거 유사 패턴 — Yahoo Finance 2년 데이터 기반
          </p>
        </div>
      </div>

      {/* Input Panel */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4">
        <div className="flex-1 min-w-40">
          <label className="mb-1 block text-xs text-zinc-500">티커 심볼</label>
          <input
            type="text"
            placeholder="AAPL, NVDA, 005930 ..."
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            onKeyDown={e => e.key === "Enter" && analyze()}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">패턴 기간</label>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-500"
          >
            <option value={10}>10일</option>
            <option value={20}>20일</option>
            <option value={30}>30일</option>
            <option value={40}>40일</option>
          </select>
        </div>
        <button
          onClick={() => analyze()}
          disabled={loading || !ticker.trim()}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
            loading || !ticker.trim()
              ? "cursor-not-allowed bg-zinc-700 text-zinc-500"
              : "bg-purple-600 text-white hover:bg-purple-700"
          )}
        >
          <Search className="h-4 w-4" />
          {loading ? "분석 중..." : "분석"}
        </button>
      </div>

      {/* Popular tickers */}
      {!data && !loading && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-600">추천:</span>
          {POPULAR_TICKERS.map(t => (
            <button
              key={t}
              onClick={() => {
                setTicker(t);
                analyze(t, days);
              }}
              className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-purple-500/50 hover:text-purple-400"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <Skeleton />}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Stock info bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div>
              <span className="text-lg font-bold text-zinc-100">{data.ticker}</span>
              <span className="ml-2 text-sm text-zinc-500">{data.name}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-200">
                {data.currency === "KRW"
                  ? `₩${data.currentPrice.toLocaleString()}`
                  : `$${data.currentPrice.toFixed(2)}`}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  data.currentReturnPct >= 0
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                {data.currentReturnPct >= 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {data.currentReturnPct >= 0 ? "+" : ""}
                {data.currentReturnPct.toFixed(2)}%
              </span>
              <span className="text-xs text-zinc-600">오늘</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-purple-500/20 text-purple-300 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "mdd" && <MddTab data={data} />}
          {activeTab === "dist" && <ReturnDistTab data={data} />}
          {activeTab === "pattern" && <PatternTab data={data} />}
        </>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
            <BarChart2 className="h-8 w-8 text-purple-400 opacity-60" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-zinc-400">티커를 입력하고 분석을 시작하세요</p>
            <p className="text-sm text-zinc-600">
              미국 주식 (AAPL, NVDA) 및 한국 주식 (005930, 000660) 모두 지원합니다
            </p>
          </div>
          {submitted && (
            <p className="text-xs text-zinc-700">마지막 조회: {submitted.ticker} ({submitted.days}일)</p>
          )}
        </div>
      )}
    </div>
  );
}
