"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Play,
  Plus,
  X,
  Trophy,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Sparkles,
  FlaskConical,
  Loader2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EquityPoint {
  date: string;
  value: number;
}

interface StrategyResult {
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number | null;
  totalTrades: number;
  equityCurve: EquityPoint[];
  yearlyReturns: { year: number; return: number }[];
}

interface StrategyDef {
  id?: string;
  name: string;
  nameEn: string;
  description: string;
  results: Record<string, StrategyResult | null>;
}

interface StrategyLabResults {
  strategies: Record<string, StrategyDef>;
  startDate: string;
  endDate: string;
  period: string;
}

type SortKey = "cagr" | "mdd" | "sharpe" | "winRate" | "totalReturn";
type SortDir = "asc" | "desc";

// ─── Constants ────────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  buyHold: "#3b82f6",
  dca: "#10b981",
  goldenCross: "#f59e0b",
  rsiMeanReversion: "#ef4444",
  macd: "#8b5cf6",
  bollinger: "#06b6d4",
  momentum52: "#f97316",
  turtle: "#ec4899",
  ross: "#a855f7",
  ai_custom: "#14b8a6",
};

const STRATEGY_IDS = [
  "buyHold",
  "dca",
  "goldenCross",
  "rsiMeanReversion",
  "macd",
  "bollinger",
  "momentum52",
  "turtle",
  "ross",
];

const STRATEGY_LABELS: Record<string, string> = {
  buyHold: "바이 앤 홀드",
  dca: "정액 분할매수",
  goldenCross: "골든 크로스",
  rsiMeanReversion: "RSI 평균회귀",
  macd: "MACD 크로스",
  bollinger: "볼린저 밴드",
  momentum52: "52주 모멘텀",
  turtle: "터틀 트레이딩",
  ross: "ROSS",
};

const PRESET_TICKERS = ["QQQ", "VOO", "QLD", "TQQQ", "UPRO", "SOXL", "KORU", "SPY"];

const PERIODS = [
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
  { value: "10y", label: "10Y" },
  { value: "max", label: "Max" },
];

const LINE_COLORS_EXTRA = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#a855f7",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cagrColor(v: number): string {
  if (v >= 20) return "text-emerald-400";
  if (v >= 10) return "text-green-400";
  if (v >= 0) return "text-lime-400";
  if (v >= -10) return "text-orange-400";
  return "text-red-400";
}

function cagrBg(v: number): string {
  if (v >= 20) return "bg-emerald-500/20 text-emerald-300";
  if (v >= 10) return "bg-green-500/15 text-green-300";
  if (v >= 0) return "bg-lime-500/10 text-lime-300";
  if (v >= -10) return "bg-orange-500/15 text-orange-300";
  return "bg-red-500/15 text-red-300";
}

function fmt(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
}

function fmtDate(s: string): string {
  if (!s) return "";
  return s.slice(0, 7);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center text-zinc-500">
      <FlaskConical className="h-14 w-14 opacity-20" />
      <p className="text-base font-medium">전략 파라미터를 설정하고 백테스트를 실행하세요</p>
      <p className="text-sm opacity-70">
        8가지 투자 전략을 여러 티커에 동시에 비교할 수 있습니다
      </p>
    </div>
  );
}

// ─── Ranking helpers ──────────────────────────────────────────────────────────

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function getRankingByTicker(
  strategies: Record<string, StrategyDef>,
  ticker: string
): { sid: string; cagr: number; rank: number }[] {
  const entries = Object.entries(strategies)
    .map(([sid, s]) => ({ sid, cagr: s.results[ticker]?.cagr ?? -Infinity }))
    .filter((e) => e.cagr > -Infinity)
    .sort((a, b) => b.cagr - a.cagr);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

// avg CAGR across tickers for a strategy
function avgCagr(s: StrategyDef, tickers: string[]): number {
  const vals = tickers.map((t) => s.results[t]?.cagr ?? null).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -Infinity;
}

// ─── Ranking Panel ────────────────────────────────────────────────────────────

function RankingPanel({
  results,
  tickers,
}: {
  results: StrategyLabResults;
  tickers: string[];
}) {
  const [rankTicker, setRankTicker] = useState(tickers[0] ?? "");

  const ranking = useMemo(
    () => getRankingByTicker(results.strategies, rankTicker),
    [results, rankTicker]
  );

  return (
    <div className="space-y-3">
      {tickers.length > 1 && (
        <div className="flex gap-1">
          {tickers.map((t) => (
            <button
              key={t}
              onClick={() => setRankTicker(t)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition",
                rankTicker === t
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {ranking.map(({ sid, cagr, rank }) => {
          const s = results.strategies[sid];
          if (!s) return null;
          const barWidth = Math.max(0, Math.min(100, ((cagr + 20) / 80) * 100));
          const color = STRATEGY_COLORS[sid] ?? "#71717a";
          return (
            <div key={sid} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-bold text-zinc-400 shrink-0">
                {RANK_MEDALS[rank - 1] ?? `${rank}`}
              </span>
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-zinc-300 truncate">{s.name}</span>
              </div>
              <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barWidth}%`, background: color + "cc" }}
                />
              </div>
              <span className={cn("w-16 text-right text-xs font-semibold tabular-nums shrink-0", cagrColor(cagr))}>
                {fmt(cagr)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Summary Heatmap Table ────────────────────────────────────────────────────

function SummaryTable({
  results,
  tickers,
}: {
  results: StrategyLabResults;
  tickers: string[];
}) {
  // Sort strategies by average CAGR across tickers (descending)
  const strategies = Object.entries(results.strategies).sort(
    ([, a], [, b]) => avgCagr(b, tickers) - avgCagr(a, tickers)
  );

  // Per-ticker rank map: sid -> ticker -> rank
  const rankMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const ticker of tickers) {
      const ranked = getRankingByTicker(results.strategies, ticker);
      for (const { sid, rank } of ranked) {
        if (!map[sid]) map[sid] = {};
        map[sid][ticker] = rank;
      }
    }
    return map;
  }, [results, tickers]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="py-2 text-left font-semibold text-zinc-400 pr-4">전략 (CAGR 순)</th>
            {tickers.map((t) => (
              <th key={t} className="py-2 text-center font-semibold text-zinc-400 px-2">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strategies.map(([sid, strat], rowIdx) => (
            <tr key={sid} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-right text-[10px] text-zinc-600 shrink-0">
                    {RANK_MEDALS[rowIdx] ?? `${rowIdx + 1}`}
                  </span>
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: STRATEGY_COLORS[sid] ?? "#71717a" }}
                  />
                  <span className="font-medium text-zinc-300">{strat.name}</span>
                </div>
              </td>
              {tickers.map((ticker) => {
                const r = strat.results[ticker];
                const rank = rankMap[sid]?.[ticker];
                if (!r) {
                  return (
                    <td key={ticker} className="py-2 px-2 text-center text-zinc-600">—</td>
                  );
                }
                return (
                  <td key={ticker} className="py-2 px-2 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold tabular-nums",
                        cagrBg(r.cagr)
                      )}
                    >
                      {rank && rank <= 3 && (
                        <span className="text-[10px]">{RANK_MEDALS[rank - 1]}</span>
                      )}
                      {fmt(r.cagr)}%
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Equity Chart ─────────────────────────────────────────────────────────────

function EquityChart({
  results,
  tickers,
  visibleStrategies,
  onToggle,
}: {
  results: StrategyLabResults;
  tickers: string[];
  visibleStrategies: Set<string>;
  onToggle: (key: string) => void;
}) {
  const strategies = Object.entries(results.strategies);

  // Build merged data: one row per date, columns = strategyId_ticker
  const merged = useMemo(() => {
    const dateSet = new Set<string>();
    for (const [, strat] of strategies) {
      for (const ticker of tickers) {
        const r = strat.results[ticker];
        if (r) for (const pt of r.equityCurve) dateSet.add(pt.date);
      }
    }
    const dates = [...dateSet].sort();

    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const [sid, strat] of strategies) {
        for (const ticker of tickers) {
          const r = strat.results[ticker];
          if (!r) continue;
          const key = tickers.length > 1 ? `${sid}_${ticker}` : sid;
          const pt = r.equityCurve.find((p) => p.date === date);
          if (pt) row[key] = Math.round((pt.value / (r.equityCurve[0]?.value || 1)) * 10000) / 100;
        }
      }
      return row;
    });
  }, [results, tickers, strategies]);

  // Sort line keys by final CAGR (descending) for ranked display
  const lineKeysRaw: { key: string; label: string; color: string; cagr: number }[] = [];
  for (const [sid, strat] of strategies) {
    for (const ticker of tickers) {
      const r = strat.results[ticker];
      if (!r) continue;
      const key = tickers.length > 1 ? `${sid}_${ticker}` : sid;
      const label = tickers.length > 1 ? `${strat.name} / ${ticker}` : strat.name;
      lineKeysRaw.push({ key, label, color: STRATEGY_COLORS[sid] ?? "#71717a", cagr: r.cagr });
    }
  }
  const lineKeys = lineKeysRaw.sort((a, b) => b.cagr - a.cagr);

  const thinned = merged.length > 600 ? merged.filter((_, i) => i % 2 === 0) : merged;

  return (
    <div className="space-y-3">
      {/* Toggle buttons — sorted by CAGR with rank badges */}
      <div className="flex flex-wrap gap-1.5">
        {lineKeys.map(({ key, label, color, cagr }, idx) => {
          const active = visibleStrategies.has(key);
          const medal = RANK_MEDALS[idx];
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                active
                  ? "border-transparent text-white"
                  : "border-zinc-700 bg-transparent text-zinc-500 hover:border-zinc-600"
              )}
              style={active ? { background: color + "33", borderColor: color, color } : undefined}
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: active ? color : "#52525b" }}
              />
              <span>{medal ?? `${idx + 1}`}</span>
              {label}
              <span className={cn("ml-0.5 font-bold tabular-nums", active ? "opacity-90" : "opacity-50")}>
                {fmt(cagr)}%
              </span>
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={thinned} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
            width={54}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => {
              const lk = lineKeys.find((l) => l.key === name);
              return [`${Number(v).toFixed(1)}%`, lk?.label ?? (name ?? "")];
            }}
            labelFormatter={(l) => String(l)}
            contentStyle={{
              fontSize: 11,
              borderRadius: "0.5rem",
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#e4e4e7",
            }}
          />
          <Legend
            formatter={(v: string) => {
              const lk = lineKeys.find((l) => l.key === v);
              return lk?.label ?? v;
            }}
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          />
          {lineKeys.map(({ key, color }) =>
            visibleStrategies.has(key) ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-zinc-600 text-right">* 수익률 정규화 (시작 = 100%)</p>
    </div>
  );
}

// ─── Yearly Returns Chart ─────────────────────────────────────────────────────

function YearlyChart({
  results,
  tickers,
}: {
  results: StrategyLabResults;
  tickers: string[];
}) {
  const [selectedTicker, setSelectedTicker] = useState(tickers[0] ?? "");
  const strategies = Object.entries(results.strategies);

  const merged = useMemo(() => {
    const yearSet = new Set<number>();
    for (const [, strat] of strategies) {
      const r = strat.results[selectedTicker];
      if (r) for (const y of r.yearlyReturns) yearSet.add(y.year);
    }
    const years = [...yearSet].sort();
    return years.map((year) => {
      const row: Record<string, string | number> = { year: String(year) };
      for (const [sid, strat] of strategies) {
        const r = strat.results[selectedTicker];
        if (!r) continue;
        const yy = r.yearlyReturns.find((y) => y.year === year);
        row[sid] = yy?.return ?? 0;
      }
      return row;
    });
  }, [results, selectedTicker, strategies]);

  const colorList = strategies.map(([sid], i) => ({
    sid,
    color: STRATEGY_COLORS[sid] ?? LINE_COLORS_EXTRA[i % LINE_COLORS_EXTRA.length],
  }));

  return (
    <div className="space-y-3">
      {tickers.length > 1 && (
        <div className="flex gap-1">
          {tickers.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTicker(t)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition",
                selectedTicker === t
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
            width={50}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => {
              const strat = name ? results.strategies[name] : undefined;
              return [`${Number(v).toFixed(1)}%`, strat?.name ?? (name ?? "")];
            }}
            labelFormatter={(l) => `${l}년`}
            contentStyle={{
              fontSize: 11,
              borderRadius: "0.5rem",
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#e4e4e7",
            }}
          />
          <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
          <Legend
            formatter={(v: string) => results.strategies[v]?.name ?? v}
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          />
          {colorList.map(({ sid, color }) => (
            <Bar key={sid} dataKey={sid} fill={color} maxBarSize={30}>
              {merged.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={(entry[sid] as number) >= 0 ? color : "#ef4444"}
                  opacity={(entry[sid] as number) >= 0 ? 1 : 0.7}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Detail Table ─────────────────────────────────────────────────────────────

function DetailTable({
  results,
  tickers,
}: {
  results: StrategyLabResults;
  tickers: string[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cagr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const r: {
      stratId: string;
      stratName: string;
      ticker: string;
      cagr: number;
      totalReturn: number;
      mdd: number;
      sharpe: number;
      winRate: number | null;
      totalTrades: number;
    }[] = [];
    for (const [sid, strat] of Object.entries(results.strategies)) {
      for (const ticker of tickers) {
        const res = strat.results[ticker];
        if (!res) continue;
        r.push({
          stratId: sid,
          stratName: strat.name,
          ticker,
          cagr: res.cagr,
          totalReturn: res.totalReturn,
          mdd: res.mdd,
          sharpe: res.sharpe,
          winRate: res.winRate,
          totalTrades: res.totalTrades,
        });
      }
    }
    return r.sort((a, b) => {
      const av = sortKey === "winRate" ? (a.winRate ?? -Infinity) : a[sortKey];
      const bv = sortKey === "winRate" ? (b.winRate ?? -Infinity) : b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [results, tickers, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortDir === "desc" ? (
      <ChevronDown className="h-3 w-3 text-blue-400" />
    ) : (
      <ChevronUp className="h-3 w-3 text-blue-400" />
    );
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: "cagr", label: "CAGR" },
    { key: "totalReturn", label: "총수익률" },
    { key: "mdd", label: "MDD" },
    { key: "sharpe", label: "Sharpe" },
    { key: "winRate", label: "승률" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-2 text-left font-semibold pr-3">전략</th>
            <th className="py-2 text-left font-semibold pr-3">티커</th>
            {cols.map(({ key, label }) => (
              <th
                key={key}
                className="py-2 text-right font-semibold cursor-pointer hover:text-zinc-300 transition px-2"
                onClick={() => handleSort(key)}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  {label}
                  <SortIcon col={key} />
                </span>
              </th>
            ))}
            <th className="py-2 text-right font-semibold px-2">거래수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.stratId}-${r.ticker}-${i}`}
              className="border-b border-zinc-800/40 hover:bg-zinc-800/20"
            >
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: STRATEGY_COLORS[r.stratId] ?? "#71717a" }}
                  />
                  <span className="font-medium text-zinc-300">{r.stratName}</span>
                </div>
              </td>
              <td className="py-2 pr-3 font-semibold text-zinc-400">{r.ticker}</td>
              <td className={cn("py-2 px-2 text-right font-semibold tabular-nums", cagrColor(r.cagr))}>
                {fmt(r.cagr)}%
              </td>
              <td className={cn("py-2 px-2 text-right tabular-nums", r.totalReturn >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmt(r.totalReturn)}%
              </td>
              <td className="py-2 px-2 text-right text-red-400 tabular-nums">
                -{r.mdd.toFixed(1)}%
              </td>
              <td
                className={cn(
                  "py-2 px-2 text-right tabular-nums",
                  r.sharpe >= 1 ? "text-emerald-400" : r.sharpe >= 0 ? "text-yellow-400" : "text-red-400"
                )}
              >
                {r.sharpe.toFixed(3)}
              </td>
              <td className="py-2 px-2 text-right text-zinc-400 tabular-nums">
                {r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—"}
              </td>
              <td className="py-2 px-2 text-right text-zinc-500 tabular-nums">{r.totalTrades}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-600">데이터가 없습니다.</p>
      )}
    </div>
  );
}

// ─── AI Analysis Tab ──────────────────────────────────────────────────────────

function AiAnalysisTab({
  results,
  tickers,
  period,
}: {
  results: StrategyLabResults;
  tickers: string[];
  period: string;
}) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analyze",
          results: results.strategies,
          tickers,
          period,
        }),
      });
      const data = await res.json() as { analysis?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {loading ? "AI 분석 중..." : "AI 분석 실행"}
        </Button>
        <p className="text-xs text-zinc-500">GPT-4.1-nano가 백테스트 결과를 종합 분석합니다</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {analysis && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="prose prose-invert prose-sm max-w-none">
            {analysis.split("\n").map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={i} className="mt-4 mb-2 text-sm font-bold text-zinc-200 first:mt-0">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("### ")) {
                return (
                  <h3 key={i} className="mt-3 mb-1 text-xs font-semibold text-zinc-300">
                    {line.replace("### ", "")}
                  </h3>
                );
              }
              if (line.startsWith("**") && line.endsWith("**")) {
                return (
                  <p key={i} className="font-semibold text-zinc-200 my-1 text-xs">
                    {line.replace(/\*\*/g, "")}
                  </p>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <p key={i} className="pl-3 text-xs text-zinc-400 my-0.5 before:content-['•'] before:mr-2 before:text-zinc-600">
                    {line.replace("- ", "").replace(/\*\*(.*?)\*\*/g, "$1")}
                  </p>
                );
              }
              if (line.trim() === "") return <div key={i} className="h-2" />;
              return (
                <p key={i} className="text-xs text-zinc-400 my-1">
                  {line.replace(/\*\*(.*?)\*\*/g, "$1")}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-zinc-600">
          <Sparkles className="h-10 w-10 opacity-20" />
          <p className="text-sm">버튼을 눌러 AI 분석을 실행하세요</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StrategyLabPage() {
  const [tickers, setTickers] = useState<string[]>(["QQQ", "VOO", "TQQQ"]);
  const [tickerInput, setTickerInput] = useState("");
  const [period, setPeriod] = useState("5y");
  const [initialCash, setInitialCash] = useState(10000);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(["all"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StrategyLabResults | null>(null);
  const [activeTab, setActiveTab] = useState("chart");
  const [customStrategy, setCustomStrategy] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [customResult, setCustomResult] = useState<string | null>(null);

  // Visible strategies for chart toggle (initialized when results arrive)
  const [visibleStrategies, setVisibleStrategies] = useState<Set<string>>(new Set());

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers([...tickers, t]);
    setTickerInput("");
  };

  const removeTicker = (t: string) => setTickers(tickers.filter((x) => x !== t));

  const togglePreset = (t: string) => {
    if (tickers.includes(t)) {
      setTickers(tickers.filter((x) => x !== t));
    } else {
      setTickers([...tickers, t]);
    }
  };

  const toggleStrategy = (sid: string) => {
    if (sid === "all") {
      setSelectedStrategies(["all"]);
      return;
    }
    const without = selectedStrategies.filter((s) => s !== "all" && s !== sid);
    if (selectedStrategies.includes(sid)) {
      setSelectedStrategies(without.length === 0 ? ["all"] : without);
    } else {
      setSelectedStrategies([...without.filter((s) => s !== "all"), sid]);
    }
  };

  const selectAllStrategies = () => setSelectedStrategies(["all"]);

  const runBacktest = async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, period, initialCash, strategies: selectedStrategies }),
      });
      const data = await res.json() as StrategyLabResults & { error?: string };
      if (data.error) throw new Error(data.error);
      setResults(data);

      // Initialize all strategy keys as visible
      const allKeys = new Set<string>();
      for (const [sid, strat] of Object.entries(data.strategies)) {
        for (const ticker of tickers) {
          if (strat.results[ticker]) {
            const key = tickers.length > 1 ? `${sid}_${ticker}` : sid;
            allKeys.add(key);
          }
        }
      }
      setVisibleStrategies(allKeys);
      setActiveTab("chart");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleChartStrategy = (key: string) => {
    setVisibleStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const generateCustomStrategy = async () => {
    if (!customStrategy.trim()) return;
    setCustomLoading(true);
    setCustomResult(null);
    try {
      const res = await fetch("/api/strategy-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "custom_strategy", description: customStrategy }),
      });
      const data = await res.json() as { strategy?: Record<string, unknown>; error?: string };
      if (data.error) throw new Error(data.error);
      setCustomResult(JSON.stringify(data.strategy, null, 2));
    } catch (e) {
      setCustomResult(`오류: ${String(e)}`);
    } finally {
      setCustomLoading(false);
    }
  };

  const tabs = [
    { key: "chart", label: "수익률 차트" },
    { key: "yearly", label: "연도별 수익" },
    { key: "detail", label: "상세 지표" },
    { key: "ai", label: "AI 분석" },
  ];

  const strategyAll = selectedStrategies.includes("all");

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <FlaskConical className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">전략 연구소 / Strategy Lab</h1>
          <p className="text-sm text-zinc-500">8가지 투자 전략을 여러 티커에 동시에 백테스트합니다</p>
        </div>
      </div>

      {/* Config Panel */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-300">파라미터 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Ticker Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500">종목 티커</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {tickers.map((t) => (
                <Badge
                  key={t}
                  variant="secondary"
                  className="gap-1 pr-1 bg-zinc-800 text-zinc-200 border-zinc-700"
                >
                  {t}
                  <button
                    onClick={() => removeTicker(t)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <input
                  className="h-7 w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                  placeholder="TSLA"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && addTicker()}
                />
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-zinc-700" onClick={addTicker}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* Preset ticker chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => togglePreset(t)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                    tickers.includes(t)
                      ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Period + Initial Cash */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">기간</label>
              <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/80 p-1">
                {PERIODS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-semibold transition",
                      period === value
                        ? "bg-blue-600 text-white shadow"
                        : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
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
                className="h-9 w-36 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                value={initialCash}
                onChange={(e) => setInitialCash(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Strategy Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-zinc-500">전략 선택</label>
              <button
                onClick={selectAllStrategies}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition",
                  strategyAll
                    ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                )}
              >
                전체 선택
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGY_IDS.map((sid) => {
                const active = strategyAll || selectedStrategies.includes(sid);
                return (
                  <button
                    key={sid}
                    onClick={() => toggleStrategy(sid)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      active
                        ? "border-transparent text-white"
                        : "border-zinc-700 bg-zinc-800/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    )}
                    style={
                      active
                        ? {
                            background: (STRATEGY_COLORS[sid] ?? "#71717a") + "33",
                            borderColor: STRATEGY_COLORS[sid] ?? "#71717a",
                            color: STRATEGY_COLORS[sid] ?? "#e4e4e7",
                          }
                        : undefined
                    }
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ background: active ? STRATEGY_COLORS[sid] ?? "#71717a" : "#52525b" }}
                    />
                    {STRATEGY_LABELS[sid]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Run Button */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={runBacktest}
              disabled={loading || tickers.length === 0}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6"
            >
              {loading ? <Spinner /> : <Play className="h-4 w-4" />}
              {loading ? "백테스트 실행 중..." : "백테스트 실행"}
            </Button>
            {tickers.length === 0 && (
              <p className="text-xs text-zinc-600">티커를 하나 이상 추가하세요</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Custom Strategy */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
            <Sparkles className="h-4 w-4 text-violet-400" />
            AI 전략 생성
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">
            자연어로 투자 전략을 설명하면 AI가 구조화된 전략 파라미터를 생성합니다
          </p>
          <div className="flex gap-2">
            <textarea
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition resize-none"
              rows={2}
              placeholder="예: RSI가 25 아래면 매수, 75 위면 매도 / 10주 이동평균이 30주를 돌파하면 매수..."
              value={customStrategy}
              onChange={(e) => setCustomStrategy(e.target.value)}
            />
            <Button
              onClick={generateCustomStrategy}
              disabled={customLoading || !customStrategy.trim()}
              variant="outline"
              className="shrink-0 border-zinc-700 hover:bg-violet-500/10 hover:border-violet-500/50 hover:text-violet-300"
            >
              {customLoading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">AI로 전략 생성</span>
            </Button>
          </div>
          {customResult && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                생성된 전략 파라미터
              </p>
              <pre className="text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap">{customResult}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results ? (
        <div className="space-y-4">
          {/* Summary heatmap */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
                <Trophy className="h-4 w-4 text-amber-400" />
                전략별 CAGR 요약 (수익률 순)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Ranking bar chart per ticker */}
              <div>
                <p className="mb-3 text-xs font-semibold text-zinc-500">📊 전략 순위 (티커별)</p>
                <RankingPanel results={results} tickers={tickers} />
              </div>
              <div className="border-t border-zinc-800 pt-4">
                <p className="mb-2 text-xs font-semibold text-zinc-500">🗂 전체 비교표</p>
                <SummaryTable results={results} tickers={tickers} />
              </div>
            </CardContent>
          </Card>

          {/* Best/Worst highlight */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(() => {
              const pairs: { sid: string; ticker: string; cagr: number; name: string }[] = [];
              for (const [sid, strat] of Object.entries(results.strategies)) {
                for (const ticker of tickers) {
                  const r = strat.results[ticker];
                  if (r) pairs.push({ sid, ticker, cagr: r.cagr, name: strat.name });
                }
              }
              if (pairs.length === 0) return null;

              const sorted = [...pairs].sort((a, b) => b.cagr - a.cagr);
              const best = sorted[0];
              const worst = sorted[sorted.length - 1];
              const bestSharpe = pairs.reduce((a, b) => {
                const ra = results.strategies[a.sid].results[a.ticker];
                const rb = results.strategies[b.sid].results[b.ticker];
                return (rb?.sharpe ?? 0) > (ra?.sharpe ?? 0) ? b : a;
              });

              const cards = [
                {
                  icon: <TrendingUp className="h-4 w-4 text-emerald-400" />,
                  label: "최고 CAGR",
                  value: `${fmt(best.cagr)}%`,
                  sub: `${best.name} / ${best.ticker}`,
                  cls: "text-emerald-400",
                },
                {
                  icon: <TrendingDown className="h-4 w-4 text-red-400" />,
                  label: "최저 CAGR",
                  value: `${fmt(worst.cagr)}%`,
                  sub: `${worst.name} / ${worst.ticker}`,
                  cls: "text-red-400",
                },
                {
                  icon: <BarChart2 className="h-4 w-4 text-blue-400" />,
                  label: "최고 Sharpe",
                  value: (results.strategies[bestSharpe.sid].results[bestSharpe.ticker]?.sharpe ?? 0).toFixed(3),
                  sub: `${bestSharpe.name} / ${bestSharpe.ticker}`,
                  cls: "text-blue-400",
                },
              ];

              return cards.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {c.icon}
                    <p className="text-xs text-zinc-500">{c.label}</p>
                  </div>
                  <p className={cn("text-2xl font-bold tabular-nums", c.cls)}>{c.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">{c.sub}</p>
                </div>
              ));
            })()}
          </div>

          {/* Tabs */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-0">
              <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-3">
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
            </CardHeader>
            <CardContent className="pt-4">
              {activeTab === "chart" && (
                <EquityChart
                  results={results}
                  tickers={tickers}
                  visibleStrategies={visibleStrategies}
                  onToggle={toggleChartStrategy}
                />
              )}
              {activeTab === "yearly" && (
                <YearlyChart results={results} tickers={tickers} />
              )}
              {activeTab === "detail" && (
                <DetailTable results={results} tickers={tickers} />
              )}
              {activeTab === "ai" && (
                <AiAnalysisTab results={results} tickers={tickers} period={results.period} />
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        !loading && <EmptyState />
      )}

      {loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-zinc-500">
          <Loader2 className="h-10 w-10 animate-spin opacity-40" />
          <p className="text-sm">
            {tickers.length}개 티커 × 8가지 전략 백테스트 실행 중...
          </p>
          <p className="text-xs opacity-60">Yahoo Finance에서 주간 데이터를 가져오는 중입니다</p>
        </div>
      )}
    </div>
  );
}
