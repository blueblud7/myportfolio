"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Play, Loader2, PieChart, Trophy, ShieldAlert, TrendingUp,
  TrendingDown, ChevronUp, ChevronDown, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "low" | "medium" | "high" | "extreme";

interface PortfolioResult {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  weights: Record<string, number>;
  tickers: string[];
  actualStart: string;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  volatility: number;
  calmar: number;
  maxRecoveryWeeks: number;
  score: number;
  rank: number;
  crisis2020: number;
  crisis2022: number;
  equityCurve: { date: string; value: number }[];
  yearlyReturns: { year: number; return: number }[];
}

interface MixResponse {
  portfolios: PortfolioResult[];
  startDate: string;
  endDate: string;
  period: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: "1y", label: "1년" }, { key: "3y", label: "3년" },
  { key: "5y", label: "5년" }, { key: "10y", label: "10년" },
  { key: "20y", label: "20년" }, { key: "max", label: "전체" },
];

const RISK_COLORS: Record<RiskLevel, string> = {
  low:     "#10b981",
  medium:  "#3b82f6",
  high:    "#f59e0b",
  extreme: "#ef4444",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low:     "안전",
  medium:  "중립",
  high:    "공격",
  extreme: "극공격",
};

// Build equity chart colors: distribute shades per risk level
function getPortfolioColor(p: PortfolioResult, idx: number): string {
  const base = RISK_COLORS[p.riskLevel];
  // Slightly vary opacity/shade by index for readability
  const alpha = Math.max(60, 255 - idx * 10).toString(16).padStart(2, "0");
  return base + alpha;
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number, d = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
}
function fmtDate(s: string) {
  return s.slice(0, 7);
}
function crisisColor(v: number) {
  if (v >= -10) return "text-emerald-400";
  if (v >= -20) return "text-yellow-400";
  if (v >= -40) return "text-orange-400";
  return "text-red-400";
}
function crisisBg(v: number) {
  if (v >= -10) return "bg-emerald-500/10 text-emerald-400";
  if (v >= -20) return "bg-yellow-500/10 text-yellow-400";
  if (v >= -40) return "bg-orange-500/10 text-orange-400";
  return "bg-red-500/10 text-red-400";
}
function cagrColor(v: number) {
  if (v >= 20) return "text-emerald-400";
  if (v >= 10) return "text-green-400";
  if (v >= 0)  return "text-lime-400";
  return "text-red-400";
}

type SortKey = "rank" | "cagr" | "totalReturn" | "mdd" | "sharpe" | "volatility" | "calmar" | "maxRecoveryWeeks";

// ─── Top Performers ───────────────────────────────────────────────────────────

function TopPerformers({ portfolios }: { portfolios: PortfolioResult[] }) {
  const bestCagr = [...portfolios].sort((a, b) => b.cagr - a.cagr)[0];
  const bestSharpe = [...portfolios].sort((a, b) => b.sharpe - a.sharpe)[0];
  const bestCrisis = [...portfolios].sort((a, b) => {
    const scoreA = a.crisis2020 + a.crisis2022;
    const scoreB = b.crisis2020 + b.crisis2022;
    return scoreB - scoreA; // least negative = best
  })[0];

  const cards = [
    {
      icon: Trophy,
      iconColor: "text-amber-400",
      bg: "border-amber-500/30 bg-amber-500/5",
      label: "최고 수익률",
      result: bestCagr,
      stat: `CAGR ${fmt(bestCagr.cagr)}%`,
      sub: `총수익 ${fmt(bestCagr.totalReturn)}%`,
    },
    {
      icon: TrendingUp,
      iconColor: "text-blue-400",
      bg: "border-blue-500/30 bg-blue-500/5",
      label: "최고 위험조정",
      result: bestSharpe,
      stat: `샤프 ${bestSharpe.sharpe.toFixed(3)}`,
      sub: `MDD -${bestSharpe.mdd.toFixed(1)}%`,
    },
    {
      icon: ShieldAlert,
      iconColor: "text-emerald-400",
      bg: "border-emerald-500/30 bg-emerald-500/5",
      label: "위기 방어 최강",
      result: bestCrisis,
      stat: `COVID ${bestCrisis.crisis2020.toFixed(1)}%`,
      sub: `2022베어 ${bestCrisis.crisis2022.toFixed(1)}%`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ icon: Icon, iconColor, bg, label, result, stat, sub }) => (
        <div key={label} className={cn("rounded-xl border p-4 space-y-2", bg)}>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", iconColor)} />
            <span className="text-xs font-semibold text-zinc-400">{label}</span>
          </div>
          <div>
            <p className="font-bold text-zinc-100 text-base truncate">{result.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <RiskBadge level={result.riskLevel} />
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-200">{stat}</p>
          <p className="text-xs text-zinc-500">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: RISK_COLORS[level] + "22", color: RISK_COLORS[level], border: `1px solid ${RISK_COLORS[level]}44` }}
    >
      {RISK_LABELS[level]}
    </span>
  );
}

// ─── Ticker Badges ────────────────────────────────────────────────────────────

function TickerBadges({ tickers }: { tickers: string[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {tickers.map(t => (
        <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[9px] font-semibold bg-zinc-800 text-zinc-400 border-zinc-700">
          {t}
        </Badge>
      ))}
    </div>
  );
}

// ─── Ranking Bar ─────────────────────────────────────────────────────────────

function RankingBar({ portfolios }: { portfolios: PortfolioResult[] }) {
  const sorted = [...portfolios].sort((a, b) => b.totalReturn - a.totalReturn);
  const maxReturn = Math.max(...sorted.map(x => Math.abs(x.totalReturn)));

  return (
    <div className="space-y-2">
      {sorted.map((p, i) => {
        const barW = Math.max(4, (Math.abs(p.totalReturn) / (maxReturn || 1)) * 100);
        const medal = i < 3 ? RANK_MEDALS[i] : `${i + 1}`;
        return (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-7 text-center text-sm shrink-0">{medal}</span>
            <div className="w-28 shrink-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: RISK_COLORS[p.riskLevel] }} />
                <span className="text-xs text-zinc-300 truncate font-medium">{p.name}</span>
              </div>
              <RiskBadge level={p.riskLevel} />
            </div>
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden min-w-0">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${barW}%`, background: RISK_COLORS[p.riskLevel] + "cc" }}
              />
            </div>
            <span className={cn("w-20 text-right text-xs font-semibold tabular-nums shrink-0", p.totalReturn >= 0 ? "text-emerald-400" : "text-red-400")}>
              {fmt(p.totalReturn)}%
            </span>
            <span className={cn("w-20 text-right text-[10px] tabular-nums shrink-0", cagrColor(p.cagr))}>
              CAGR {fmt(p.cagr)}%
            </span>
            <span className="w-14 text-right text-[10px] text-zinc-600 tabular-nums shrink-0">
              MDD {p.mdd.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Equity Chart ─────────────────────────────────────────────────────────────

function EquityChart({ portfolios }: { portfolios: PortfolioResult[] }) {
  const sorted = [...portfolios].sort((a, b) => b.totalReturn - a.totalReturn);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(sorted.map(r => r.id)));

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    sorted.forEach((p, i) => { map[p.id] = getPortfolioColor(p, i); });
    return map;
  }, [sorted]);

  const data = useMemo(() => {
    const dateSet = new Set<string>();
    for (const p of portfolios) p.equityCurve.forEach(pt => dateSet.add(pt.date));
    const dates = [...dateSet].sort();
    return dates.map(date => {
      const row: Record<string, string | number> = { date };
      for (const p of portfolios) {
        const pt = p.equityCurve.find(x => x.date === date);
        if (pt) row[p.id] = Math.round((pt.value / (p.equityCurve[0]?.value || 1)) * 1000) / 10;
      }
      return row;
    });
  }, [portfolios]);

  const toggleVisible = (id: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((p, i) => {
          const on = visible.has(p.id);
          const color = colorMap[p.id];
          return (
            <button
              key={p.id}
              onClick={() => toggleVisible(p.id)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                on ? "border-transparent text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
              )}
              style={on ? { background: color + "33", borderColor: color, color } : undefined}
            >
              <span>{i < 3 ? RANK_MEDALS[i] : `${i + 1}`}</span>
              <span className="max-w-[80px] truncate">{p.name}</span>
              <span className="ml-0.5 font-bold opacity-80">{fmt(p.totalReturn)}%</span>
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data.length > 500 ? data.filter((_, i) => i % 2 === 0) : data}
          margin={{ top: 4, right: 8, left: 0, bottom: 24 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
            width={56}
          />
          <ReferenceLine y={100} stroke="#52525b" strokeDasharray="3 3" />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => {
              const p = portfolios.find(x => x.id === name);
              return [`${Number(v).toFixed(1)}%`, p?.name ?? (name ?? "")];
            }}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 11, borderRadius: "0.5rem", border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7" }}
          />
          <Brush
            dataKey="date"
            height={20}
            stroke="#3f3f46"
            fill="#18181b"
            travellerWidth={6}
            tickFormatter={fmtDate}
            style={{ fontSize: 9, color: "#71717a" }}
          />
          {sorted.map((p, i) =>
            visible.has(p.id) ? (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                stroke={colorMap[p.id]}
                strokeWidth={i < 3 ? 2.5 : 1.5}
                dot={false}
                connectNulls
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-zinc-600 text-right">* 포트폴리오 누적 수익률 (시작=100%) · 색상: 녹=안전, 파=중립, 주황=공격, 빨=극공격 · 하단 슬라이더로 줌 가능</p>
    </div>
  );
}

// ─── Crisis Table ─────────────────────────────────────────────────────────────

function CrisisTable({ portfolios }: { portfolios: PortfolioResult[] }) {
  const sorted = [...portfolios].sort((a, b) => {
    const scoreA = a.crisis2020 + a.crisis2022;
    const scoreB = b.crisis2020 + b.crisis2022;
    return scoreB - scoreA; // least negative first = best defense
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-2 pr-3 text-left font-semibold">포트폴리오</th>
            <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">
              <span className="flex items-center justify-end gap-1">
                <AlertTriangle className="h-3 w-3 text-blue-400" />
                2020 COVID MDD
              </span>
            </th>
            <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">
              <span className="flex items-center justify-end gap-1">
                <AlertTriangle className="h-3 w-3 text-red-400" />
                2022 베어 MDD
              </span>
            </th>
            <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">위기 종합</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const combined = p.crisis2020 + p.crisis2022;
            return (
              <tr key={p.id} className={cn("border-b border-zinc-800/40 hover:bg-zinc-800/20", i === 0 && "bg-emerald-500/5")}>
                <td className="py-2 pr-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-zinc-300">{p.name}</span>
                      <RiskBadge level={p.riskLevel} />
                    </div>
                    <TickerBadges tickers={p.tickers} />
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={cn("font-semibold tabular-nums rounded px-1.5 py-0.5", crisisBg(p.crisis2020))}>
                    {p.crisis2020 === 0 ? "데이터 없음" : `${p.crisis2020.toFixed(1)}%`}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={cn("font-semibold tabular-nums rounded px-1.5 py-0.5", crisisBg(p.crisis2022))}>
                    {p.crisis2022 === 0 ? "데이터 없음" : `${p.crisis2022.toFixed(1)}%`}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={cn("font-semibold tabular-nums", crisisColor(combined / 2))}>
                    {combined.toFixed(1)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Metrics Table ────────────────────────────────────────────────────────────

function MetricsTable({ portfolios }: { portfolios: PortfolioResult[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    return [...portfolios].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [portfolios, sortKey, sortAsc]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(v => !v);
    else { setSortKey(k); setSortAsc(k === "rank" || k === "mdd" || k === "volatility" || k === "maxRecoveryWeeks"); }
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortAsc
      ? <ChevronUp className="h-3 w-3 text-blue-400" />
      : <ChevronDown className="h-3 w-3 text-blue-400" />;
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: "rank", label: "종합순위" },
    { key: "cagr", label: "CAGR" },
    { key: "totalReturn", label: "총수익" },
    { key: "mdd", label: "MDD" },
    { key: "sharpe", label: "샤프" },
    { key: "volatility", label: "변동성" },
    { key: "calmar", label: "칼마르" },
    { key: "maxRecoveryWeeks", label: "회복(주)" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-2 pr-3 text-left font-semibold">포트폴리오</th>
            {cols.map(({ key, label }) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className="py-2 px-2 text-right font-semibold cursor-pointer hover:text-zinc-300 transition whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-0.5 justify-end">
                  {label}
                  <SortIcon col={key} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id} className={cn("border-b border-zinc-800/40 hover:bg-zinc-800/20", p.rank === 1 && "bg-amber-500/5")}>
              <td className="py-2 pr-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: RISK_COLORS[p.riskLevel] }} />
                    <span className="font-medium text-zinc-300">{p.name}</span>
                    <RiskBadge level={p.riskLevel} />
                  </div>
                  <TickerBadges tickers={p.tickers} />
                </div>
              </td>
              <td className="py-2 px-2 text-right">
                {p.rank <= 3
                  ? <span className="text-base">{RANK_MEDALS[p.rank - 1]}</span>
                  : <span className="text-zinc-500 font-mono">{p.rank}위</span>}
              </td>
              <td className={cn("py-2 px-2 text-right font-semibold tabular-nums", cagrColor(p.cagr))}>{fmt(p.cagr)}%</td>
              <td className={cn("py-2 px-2 text-right tabular-nums", p.totalReturn >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(p.totalReturn)}%</td>
              <td className="py-2 px-2 text-right text-red-400 tabular-nums">-{p.mdd.toFixed(1)}%</td>
              <td className={cn("py-2 px-2 text-right tabular-nums", p.sharpe >= 1 ? "text-emerald-400" : p.sharpe >= 0 ? "text-yellow-400" : "text-red-400")}>{p.sharpe.toFixed(3)}</td>
              <td className="py-2 px-2 text-right text-zinc-400 tabular-nums">{p.volatility.toFixed(1)}%</td>
              <td className={cn("py-2 px-2 text-right tabular-nums", p.calmar >= 1 ? "text-emerald-400" : "text-yellow-400")}>{p.calmar.toFixed(3)}</td>
              <td className="py-2 px-2 text-right text-zinc-400 tabular-nums">{p.maxRecoveryWeeks}w</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Composition Panel ────────────────────────────────────────────────────────

const TICKER_COLORS: Record<string, string> = {
  QQQ: "#3b82f6", VOO: "#10b981", SPY: "#6366f1", TQQQ: "#ef4444",
  UPRO: "#f97316", QLD: "#f59e0b", SOXL: "#ec4899", BND: "#14b8a6",
  TLT: "#8b5cf6", GLD: "#eab308", KORU: "#06b6d4",
};

function CompositionPanel({ portfolios }: { portfolios: PortfolioResult[] }) {
  const [selected, setSelected] = useState<string>(portfolios[0]?.id ?? "");

  const portfolio = portfolios.find(p => p.id === selected);
  const barData = portfolio
    ? Object.entries(portfolio.weights).map(([ticker, w]) => ({ ticker, weight: Math.round(w * 1000) / 10 }))
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {portfolios.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
              selected === p.id
                ? "border-transparent text-white"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
            )}
            style={
              selected === p.id
                ? { background: RISK_COLORS[p.riskLevel] + "22", borderColor: RISK_COLORS[p.riskLevel], color: RISK_COLORS[p.riskLevel] }
                : undefined
            }
          >
            {p.name}
          </button>
        ))}
      </div>

      {portfolio && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-zinc-100 text-sm">{portfolio.name}</h3>
            <RiskBadge level={portfolio.riskLevel} />
            <span className="text-xs text-zinc-500">시작: {portfolio.actualStart}</span>
          </div>

          <div className="space-y-2">
            {barData.map(({ ticker, weight }) => (
              <div key={ticker} className="flex items-center gap-2">
                <span className="w-12 text-xs font-semibold tabular-nums text-right shrink-0" style={{ color: TICKER_COLORS[ticker] ?? "#a1a1aa" }}>
                  {ticker}
                </span>
                <div className="flex-1 h-5 rounded bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end pr-2 text-[10px] font-bold text-white/80 transition-all"
                    style={{ width: `${weight}%`, background: (TICKER_COLORS[ticker] ?? "#a1a1aa") + "cc" }}
                  >
                    {weight}%
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
            {[
              { label: "CAGR", val: `${fmt(portfolio.cagr)}%`, color: cagrColor(portfolio.cagr) },
              { label: "MDD", val: `-${portfolio.mdd.toFixed(1)}%`, color: "text-red-400" },
              { label: "샤프", val: portfolio.sharpe.toFixed(3), color: portfolio.sharpe >= 1 ? "text-emerald-400" : "text-yellow-400" },
              { label: "변동성", val: `${portfolio.volatility.toFixed(1)}%`, color: "text-zinc-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded bg-zinc-900/60 p-2 text-center">
                <p className="text-zinc-500 mb-0.5">{label}</p>
                <p className={cn("font-bold", color)}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Yearly Returns Chart ─────────────────────────────────────────────────────

function YearlyChart({ portfolios }: { portfolios: PortfolioResult[] }) {
  const top5 = [...portfolios].sort((a, b) => b.cagr - a.cagr).slice(0, 5);

  const data = useMemo(() => {
    const yearSet = new Set<number>();
    for (const p of top5) p.yearlyReturns.forEach(y => yearSet.add(y.year));
    const years = [...yearSet].sort();
    return years.map(year => {
      const row: Record<string, string | number> = { year: String(year) };
      for (const p of top5) {
        const found = p.yearlyReturns.find(y => y.year === year);
        row[p.id] = found?.return ?? 0;
      }
      return row;
    });
  }, [top5]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {top5.map(p => (
          <span key={p.id} className="flex items-center gap-1 text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: RISK_COLORS[p.riskLevel] }} />
            {p.name}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-zinc-500">CAGR 상위 5개 포트폴리오 연도별 수익률</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={52} />
          <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => [`${Number(v).toFixed(1)}%`, portfolios.find(p => p.id === name)?.name ?? (name ?? "")]}
            labelFormatter={(l) => `${l}년`}
            contentStyle={{ fontSize: 11, borderRadius: "0.5rem", border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7" }}
          />
          {top5.map(p => (
            <Bar key={p.id} dataKey={p.id} maxBarSize={20}>
              {data.map((entry, i) => (
                <Cell key={i} fill={(entry[p.id] as number) >= 0 ? RISK_COLORS[p.riskLevel] : "#ef4444"} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = "chart" | "crisis" | "metrics" | "composition" | "yearly";

export default function PortfolioMixPage() {
  const [period, setPeriod] = useState("10y");
  const [initialCash, setInitialCash] = useState(10000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MixResponse | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("chart");

  const run = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/portfolio-mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, initialCash }),
      });
      const data = (await res.json()) as MixResponse & { error?: string };
      if (data.error) throw new Error(data.error);
      setResults(data);
      setActiveTab("chart");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const portfolios = results?.portfolios ?? [];

  const tabs: { key: TabKey; label: string }[] = [
    { key: "chart",       label: "누적 수익률 차트" },
    { key: "crisis",      label: "위기 분석" },
    { key: "metrics",     label: "상세 지표" },
    { key: "composition", label: "구성 비중" },
    { key: "yearly",      label: "연도별 수익" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <PieChart className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">포트폴리오 믹스 연구소</h1>
          <p className="text-sm text-zinc-500">
            20개 멀티에셋 포트폴리오 백테스트 · 월별 리밸런싱 · 위기 방어력 비교 · CAGR/MDD/샤프/칼마르
          </p>
        </div>
      </div>

      {/* Settings */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-300">설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">백테스트 기간</label>
              <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/80 p-1">
                {PERIODS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPeriod(key)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-semibold transition",
                      period === key ? "bg-violet-600 text-white shadow" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">초기 자본 ($)</label>
              <input
                type="number"
                min={100}
                step={1000}
                className="h-9 w-36 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:border-violet-500 transition"
                value={initialCash}
                onChange={e => setInitialCash(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={run}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />분석 중 (20개 포트폴리오)...</>
              ) : (
                <><Play className="h-4 w-4" />포트폴리오 비교 실행</>
              )}
            </Button>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
              {(["low", "medium", "high", "extreme"] as RiskLevel[]).map(level => (
                <span key={level} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: RISK_COLORS[level] }} />
                  {RISK_LABELS[level]}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {portfolios.length > 0 && (
        <div className="space-y-5">
          {/* Meta info */}
          <div className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-400">{results?.startDate}</span>
            {" ~ "}
            <span className="font-medium text-zinc-400">{results?.endDate}</span>
            {" · "}
            <span className="font-medium text-zinc-400">{portfolios.length}개</span> 포트폴리오 분석 완료
            {" · "}월별 리밸런싱 적용
          </div>

          {/* Top Performers */}
          <TopPerformers portfolios={portfolios} />

          {/* Ranking Bar */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                수익률 순위 (총수익률 기준)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingBar portfolios={portfolios} />
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-0">
              <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-3">
                {tabs.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-semibold transition",
                      activeTab === key
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeTab === "chart" && <EquityChart portfolios={portfolios} />}
              {activeTab === "crisis" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[
                      { color: "text-emerald-400", label: "녹색 ≥ -10%: 위기 방어 우수" },
                      { color: "text-yellow-400",  label: "황색 -10~-20%: 보통" },
                      { color: "text-orange-400",  label: "주황 -20~-40%: 취약" },
                      { color: "text-red-400",     label: "빨강 < -40%: 매우 취약" },
                    ].map(({ color, label }) => (
                      <span key={label} className={cn("font-medium", color)}>{label}</span>
                    ))}
                  </div>
                  <CrisisTable portfolios={portfolios} />
                </div>
              )}
              {activeTab === "metrics" && <MetricsTable portfolios={portfolios} />}
              {activeTab === "composition" && <CompositionPanel portfolios={portfolios} />}
              {activeTab === "yearly" && <YearlyChart portfolios={portfolios} />}
            </CardContent>
          </Card>
        </div>
      )}

      {!results && !loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-zinc-500">
          <PieChart className="h-14 w-14 opacity-20" />
          <p className="text-base font-medium">기간을 선택 후 포트폴리오 비교를 실행하세요</p>
          <p className="text-sm opacity-70">
            QQQ, VOO, TQQQ, UPRO, QLD, SOXL, BND, TLT, GLD, KORU 등 11개 자산으로 구성된 20개 포트폴리오를 비교합니다
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {(["low", "medium", "high", "extreme"] as RiskLevel[]).map(level => (
              <span
                key={level}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{ borderColor: RISK_COLORS[level] + "66", color: RISK_COLORS[level], background: RISK_COLORS[level] + "11" }}
              >
                {RISK_LABELS[level]} 리스크
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
