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

// ─── 정규분포 벨 커브 시각화 ───────────────────────────────────────────────
function NormalDistChart({
  mean, std, currentReturn, currentPercentile,
}: {
  mean: number; std: number; currentReturn: number; currentPercentile: number;
}) {
  const W = 600, H = 200;
  const PAD = { top: 28, bottom: 44, left: 44, right: 20 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xMin = mean - 4 * std;
  const xMax = mean + 4 * std;
  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const pdf = (x: number) => (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2);
  const maxY = pdf(mean);
  const sy = (y: number) => PAD.top + (1 - y / maxY) * innerH;
  const baseline = sy(0);

  // 커브 포인트 200개
  const N = 200;
  const pts = Array.from({ length: N }, (_, i) => {
    const x = xMin + (i / (N - 1)) * (xMax - xMin);
    return { x, y: pdf(x) };
  });
  const curvePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");

  // σ 구간별 색상 채우기
  const sigmaRegions = [
    { from: -4, to: -3, color: "#dc2626", alpha: 0.45 },
    { from: -3, to: -2, color: "#ea580c", alpha: 0.40 },
    { from: -2, to: -1, color: "#ca8a04", alpha: 0.35 },
    { from: -1, to:  1, color: "#16a34a", alpha: 0.25 },
    { from:  1, to:  2, color: "#ca8a04", alpha: 0.35 },
    { from:  2, to:  3, color: "#ea580c", alpha: 0.40 },
    { from:  3, to:  4, color: "#dc2626", alpha: 0.45 },
  ];

  const regionPath = (fromSigma: number, toSigma: number) => {
    const x0 = mean + fromSigma * std;
    const x1 = mean + toSigma * std;
    const subPts = pts.filter(p => p.x >= x0 && p.x <= x1);
    if (subPts.length < 2) return "";
    const line = subPts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    return `${line} L${sx(x1).toFixed(1)},${baseline.toFixed(1)} L${sx(x0).toFixed(1)},${baseline.toFixed(1)} Z`;
  };

  const curX = Math.max(PAD.left, Math.min(W - PAD.right, sx(currentReturn)));
  const curY = sy(pdf(currentReturn));
  const isUp = currentReturn >= mean;
  const sigmaPos = std > 0 ? ((currentReturn - mean) / std) : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-300">정규분포 상의 현재 위치</p>
        <span className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
          currentReturn >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        )}>
          {currentReturn >= 0 ? "+" : ""}{currentReturn.toFixed(2)}% · {currentPercentile}번째 백분위
        </span>
      </div>
      <p className="mb-3 text-xs text-zinc-600">
        녹색=±1σ(68%) · 노란=±2σ(95%) · 주황=±3σ(99.7%) · 빨강=극단값
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* σ 구간 채우기 */}
        {sigmaRegions.map((r, i) => {
          const d = regionPath(r.from, r.to);
          return d ? <path key={i} d={d} fill={r.color} fillOpacity={r.alpha} /> : null;
        })}

        {/* 현재 위치 아래 영역 강조 (현재값까지 음영) */}
        {(() => {
          const subPts = isUp
            ? pts.filter(p => p.x >= xMin && p.x <= currentReturn)
            : pts.filter(p => p.x >= xMin && p.x <= currentReturn);
          if (subPts.length < 2) return null;
          const line = subPts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
          const d = `${line} L${curX.toFixed(1)},${baseline.toFixed(1)} L${sx(xMin).toFixed(1)},${baseline.toFixed(1)} Z`;
          return <path d={d} fill={isUp ? "#10b981" : "#ef4444"} fillOpacity={0.12} />;
        })()}

        {/* 메인 커브 */}
        <path d={curvePath} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" />

        {/* 현재 위치 수직선 */}
        <line x1={curX} y1={PAD.top - 8} x2={curX} y2={baseline}
          stroke="#facc15" strokeWidth={1.5} strokeDasharray="4,3" />

        {/* 현재 위치 점 */}
        <circle cx={curX} cy={curY} r={5} fill="#facc15" stroke="#18181b" strokeWidth={1.5} />

        {/* 현재값 레이블 */}
        <rect x={curX - 34} y={PAD.top - 24} width={68} height={17} rx={4}
          fill="#facc15" fillOpacity={0.15} stroke="#facc15" strokeWidth={0.8} strokeOpacity={0.6} />
        <text x={curX} y={PAD.top - 12} textAnchor="middle" fill="#facc15" fontSize={10} fontWeight="bold">
          {currentReturn >= 0 ? "+" : ""}{currentReturn.toFixed(2)}%
        </text>

        {/* 기준선 */}
        <line x1={PAD.left} y1={baseline} x2={W - PAD.right} y2={baseline} stroke="#3f3f46" strokeWidth={1} />

        {/* σ 눈금 */}
        {([-3, -2, -1, 0, 1, 2, 3] as const).map(n => {
          const lx = sx(mean + n * std);
          const val = (mean + n * std).toFixed(1);
          return (
            <g key={n}>
              <line x1={lx} y1={baseline} x2={lx} y2={baseline + 4} stroke="#52525b" strokeWidth={1} />
              <text x={lx} y={baseline + 13} textAnchor="middle" fill="#71717a" fontSize={9}>
                {n === 0 ? "μ" : `${n > 0 ? "+" : ""}${n}σ`}
              </text>
              <text x={lx} y={baseline + 24} textAnchor="middle" fill="#52525b" fontSize={8}>
                {val}%
              </text>
            </g>
          );
        })}

        {/* σ 위치 텍스트 */}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="#52525b" fontSize={9}>
          현재 {sigmaPos.toFixed(2)}σ 위치 ({currentPercentile}번째 백분위)
        </text>
      </svg>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-500">
        {[
          { color: "bg-green-600/50", label: "±1σ 이내 (약 68%)" },
          { color: "bg-yellow-600/50", label: "±2σ 이내 (약 95%)" },
          { color: "bg-orange-600/50", label: "±3σ 이내 (약 99.7%)" },
          { color: "bg-red-700/50",    label: "3σ 초과 (극단값)" },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", l.color)} />{l.label}
          </span>
        ))}
      </div>
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

      {/* 정규분포 벨 커브 */}
      <NormalDistChart
        mean={data.returnStats.mean}
        std={data.returnStats.std}
        currentReturn={data.currentReturnPct}
        currentPercentile={data.currentReturnPercentile}
      />

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
