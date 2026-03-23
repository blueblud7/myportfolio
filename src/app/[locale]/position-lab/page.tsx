"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Play, Plus, X, Trophy, Loader2, TrendingUp, TrendingDown,
  Wallet, ChevronDown, ChevronUp, Target,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EquityPoint { date: string; value: number; invested: number }
interface PositionResult {
  id: string; name: string; nameEn: string; description: string;
  totalReturn: number; cagr: number; mdd: number; sharpe: number;
  avgCost: number; finalPrice: number; cashDrag: number; totalDeployed: number;
  score: number; rank: number;
  equityCurve: EquityPoint[];
  yearlyReturns: { year: number; return: number }[];
  deploymentLog: { date: string; amount: number; price: number; reason: string }[];
}
interface LabResponse {
  byTicker: Record<string, PositionResult[]>;
  startDate: string; endDate: string; period: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_TICKERS = ["QQQ", "VOO", "TQQQ", "UPRO", "SOXL", "QLD", "SPY", "KORU"];

const PERIODS = [
  { key: "1y", label: "1년" }, { key: "3y", label: "3년" },
  { key: "5y", label: "5년" }, { key: "10y", label: "10년" },
  { key: "20y", label: "20년" }, { key: "max", label: "전체" },
];

const STRATEGY_COLORS: Record<string, string> = {
  lumpSum:      "#3b82f6",
  cash20:       "#10b981",
  cash40:       "#06b6d4",
  split4:       "#f59e0b",
  split12:      "#f97316",
  mdd10:        "#8b5cf6",
  mdd20:        "#a855f7",
  mddLadder:    "#ec4899",
  dipDca:       "#ef4444",
  momentumCash: "#14b8a6",
};

const RANK_MEDALS = ["🥇", "🥈", "🥉", "4", "5", "6", "7", "8", "9", "10"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number, d = 1) { return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`; }
function fmtDate(s: string) { return s.slice(0, 7); }

function cagrColor(v: number) {
  if (v >= 20) return "text-emerald-400";
  if (v >= 10) return "text-green-400";
  if (v >= 0)  return "text-lime-400";
  return "text-red-400";
}

type SortKey = "rank" | "cagr" | "totalReturn" | "mdd" | "sharpe" | "cashDrag" | "avgCost";

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">{RANK_MEDALS[0]}</span>;
  if (rank === 2) return <span className="text-base">{RANK_MEDALS[1]}</span>;
  if (rank === 3) return <span className="text-base">{RANK_MEDALS[2]}</span>;
  return <span className="text-xs text-zinc-500 font-mono">{rank}위</span>;
}

// ─── Equity Chart ─────────────────────────────────────────────────────────────

function EquityChart({ results, ticker }: { results: PositionResult[]; ticker: string }) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set(results.map(r => r.id)));

  const data = useMemo(() => {
    const dateSet = new Set<string>();
    for (const r of results) r.equityCurve.forEach(p => dateSet.add(p.date));
    const dates = [...dateSet].sort();
    return dates.map(date => {
      const row: Record<string, string | number> = { date };
      for (const r of results) {
        const pt = r.equityCurve.find(p => p.date === date);
        if (pt) row[r.id] = Math.round((pt.value / (r.equityCurve[0]?.value || 1)) * 1000) / 10;
      }
      return row;
    });
  }, [results]);

  const sorted = [...results].sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((r, i) => {
          const on = visible.has(r.id);
          return (
            <button key={r.id} onClick={() => setVisible(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
              className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                on ? "border-transparent text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-600")}
              style={on ? { background: STRATEGY_COLORS[r.id] + "33", borderColor: STRATEGY_COLORS[r.id], color: STRATEGY_COLORS[r.id] } : undefined}>
              <span>{RANK_MEDALS[i] ?? `${i+1}`}</span>
              {r.name}
              <span className="ml-0.5 font-bold opacity-80">{fmt(r.cagr)}%</span>
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data.length > 500 ? data.filter((_, i) => i % 2 === 0) : data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={fmtDate} interval="preserveStartEnd" minTickGap={60} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={52} />
          <ReferenceLine y={100} stroke="#52525b" strokeDasharray="3 3" />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => [`${Number(v).toFixed(1)}%`, results.find(r => r.id === name)?.name ?? (name ?? "")]}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 11, borderRadius: "0.5rem", border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7" }}
          />
          <Legend formatter={(v: string) => results.find(r => r.id === v)?.name ?? v} wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
          {results.map(r => visible.has(r.id) ? (
            <Line key={r.id} type="monotone" dataKey={r.id} stroke={STRATEGY_COLORS[r.id] ?? "#888"}
              strokeWidth={r.rank <= 3 ? 2.5 : 1.5} dot={false} connectNulls />
          ) : null)}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-zinc-600 text-right">* {ticker} 수익률 정규화 (시작=100%)</p>
    </div>
  );
}

// ─── Yearly Chart ─────────────────────────────────────────────────────────────

function YearlyChart({ results }: { results: PositionResult[] }) {
  const top3 = results.filter(r => r.rank <= 3);

  const data = useMemo(() => {
    const yearSet = new Set<number>();
    for (const r of top3) r.yearlyReturns.forEach(y => yearSet.add(y.year));
    const years = [...yearSet].sort();
    return years.map(year => {
      const row: Record<string, string | number> = { year: String(year) };
      for (const r of top3) {
        const found = r.yearlyReturns.find(y => y.year === year);
        row[r.id] = found?.return ?? 0;
      }
      return row;
    });
  }, [top3]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">상위 3개 전략 연도별 수익률</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={50} />
          <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name?: string) => [`${Number(v).toFixed(1)}%`, results.find(r => r.id === name)?.name ?? (name ?? "")]}
            labelFormatter={(l) => `${l}년`}
            contentStyle={{ fontSize: 11, borderRadius: "0.5rem", border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7" }}
          />
          <Legend formatter={(v: string) => results.find(r => r.id === v)?.name ?? v} wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
          {top3.map(r => (
            <Bar key={r.id} dataKey={r.id} maxBarSize={30}>
              {data.map((entry, i) => (
                <Cell key={i} fill={(entry[r.id] as number) >= 0 ? STRATEGY_COLORS[r.id] : "#ef4444"} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Deployment Log ───────────────────────────────────────────────────────────

function DeploymentLog({ result }: { result: PositionResult }) {
  const [expanded, setExpanded] = useState(false);
  const logs = result.deploymentLog;
  const shown = expanded ? logs : logs.slice(0, 5);

  return (
    <div className="space-y-1">
      <div className="space-y-1 text-xs">
        {shown.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded px-2 py-1 bg-zinc-800/40">
            <span className="text-zinc-500 w-24 shrink-0">{l.date}</span>
            <span className={cn("font-semibold w-20 text-right shrink-0 tabular-nums", l.amount >= 0 ? "text-emerald-400" : "text-red-400")}>
              {l.amount >= 0 ? "+" : ""}${Math.abs(l.amount).toLocaleString()}
            </span>
            <span className="text-zinc-500">@ ${l.price.toFixed(2)}</span>
            <span className="text-zinc-400 truncate">{l.reason}</span>
          </div>
        ))}
      </div>
      {logs.length > 5 && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
          {expanded ? "▲ 접기" : `▼ 전체 보기 (${logs.length}건)`}
        </button>
      )}
    </div>
  );
}

// ─── Ranking Table ────────────────────────────────────────────────────────────

function RankingTable({ results, onSelectDetail }: { results: PositionResult[]; onSelectDetail: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [results, sortKey, sortAsc]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(v => !v);
    else { setSortKey(k); setSortAsc(k === "rank" || k === "mdd" || k === "cashDrag"); }
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortAsc ? <ChevronUp className="h-3 w-3 text-blue-400" /> : <ChevronDown className="h-3 w-3 text-blue-400" />;
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: "rank", label: "종합순위" }, { key: "cagr", label: "CAGR" },
    { key: "totalReturn", label: "총수익" }, { key: "mdd", label: "MDD" },
    { key: "sharpe", label: "샤프" }, { key: "cashDrag", label: "현금대기%" },
    { key: "avgCost", label: "평균단가" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-2 pr-3 text-left font-semibold">전략</th>
            {cols.map(({ key, label }) => (
              <th key={key} onClick={() => handleSort(key)}
                className="py-2 px-2 text-right font-semibold cursor-pointer hover:text-zinc-300 transition whitespace-nowrap">
                <span className="inline-flex items-center gap-0.5 justify-end">{label}<SortIcon col={key} /></span>
              </th>
            ))}
            <th className="py-2 px-2 text-right font-semibold">상세</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className={cn("border-b border-zinc-800/40 hover:bg-zinc-800/20", r.rank === 1 && "bg-amber-500/5")}>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ background: STRATEGY_COLORS[r.id] }} />
                  <span className="font-medium text-zinc-300">{r.name}</span>
                </div>
              </td>
              <td className="py-2 px-2 text-right"><ScoreBadge rank={r.rank} /></td>
              <td className={cn("py-2 px-2 text-right font-semibold tabular-nums", cagrColor(r.cagr))}>{fmt(r.cagr)}%</td>
              <td className={cn("py-2 px-2 text-right tabular-nums", r.totalReturn >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(r.totalReturn)}%</td>
              <td className="py-2 px-2 text-right text-red-400 tabular-nums">-{r.mdd.toFixed(1)}%</td>
              <td className={cn("py-2 px-2 text-right tabular-nums", r.sharpe >= 1 ? "text-emerald-400" : r.sharpe >= 0 ? "text-yellow-400" : "text-red-400")}>{r.sharpe.toFixed(3)}</td>
              <td className="py-2 px-2 text-right text-zinc-400 tabular-nums">{r.cashDrag}%</td>
              <td className="py-2 px-2 text-right text-zinc-400 tabular-nums">${r.avgCost.toFixed(2)}</td>
              <td className="py-2 px-2 text-right">
                <button onClick={() => onSelectDetail(r.id)} className="rounded px-2 py-0.5 text-[10px] border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition">
                  로그
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Best Strategy Card ───────────────────────────────────────────────────────

function BestStrategyCard({ result, ticker }: { result: PositionResult; ticker: string }) {
  const gain = ((result.finalPrice - result.avgCost) / result.avgCost * 100).toFixed(1);
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-bold text-amber-300">최적 전략 — {ticker}</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">{result.name}</h2>
          <p className="text-sm text-zinc-400 mt-0.5">{result.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-emerald-400">{fmt(result.cagr)}%</p>
          <p className="text-xs text-zinc-500">연평균 수익률</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {[
          { label: "총수익률", val: `${fmt(result.totalReturn)}%`, color: result.totalReturn >= 0 ? "text-emerald-400" : "text-red-400" },
          { label: "최대낙폭", val: `-${result.mdd.toFixed(1)}%`, color: "text-red-400" },
          { label: "샤프비율", val: result.sharpe.toFixed(3), color: result.sharpe >= 1 ? "text-emerald-400" : "text-yellow-400" },
          { label: "평균단가 대비", val: `+${gain}%`, color: "text-blue-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-lg bg-zinc-900/60 p-2.5 text-center">
            <p className="text-zinc-500 mb-1">{label}</p>
            <p className={cn("font-bold", color)}>{val}</p>
          </div>
        ))}
      </div>
      <div className="text-xs text-zinc-500">
        <span className="font-medium text-zinc-400">종합점수:</span> {result.score.toFixed(2)}점
        (CAGR 40% + 샤프 30% + MDD 30% 가중 평균 순위)
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PositionLabPage() {
  const [tickers, setTickers] = useState<string[]>(["QQQ"]);
  const [tickerInput, setTickerInput] = useState("");
  const [period, setPeriod] = useState("10y");
  const [initialCash, setInitialCash] = useState(10000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LabResponse | null>(null);

  const [activeTab, setActiveTab] = useState<"chart" | "ranking" | "yearly" | "detail">("chart");
  const [activeTicker, setActiveTicker] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const addTicker = (t?: string) => {
    const val = (t ?? tickerInput).trim().toUpperCase();
    if (val && !tickers.includes(val)) setTickers(p => [...p, val]);
    if (!t) setTickerInput("");
  };

  const run = async () => {
    if (tickers.length === 0) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await fetch("/api/position-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, period, initialCash }),
      });
      const data = await res.json() as LabResponse & { error?: string };
      if (data.error) throw new Error(data.error);
      setResults(data);
      setActiveTicker(tickers[0]);
      setActiveTab("chart");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const currentResults = results?.byTicker[activeTicker] ?? [];
  const bestResult = currentResults.find(r => r.rank === 1);
  const detailResult = detailId ? currentResults.find(r => r.id === detailId) : null;

  // ── Radar-like score summary for quick overview ────────────────────────────
  const scoreData = useMemo(() => currentResults.slice(0, 6).map(r => ({
    name: r.name, cagr: r.cagr, mdd: -r.mdd, sharpe: r.sharpe * 10, rank: r.rank,
  })), [currentResults]);
  void scoreData;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
          <Wallet className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">자금관리 전략 연구소</h1>
          <p className="text-sm text-zinc-500">
            10가지 매수 전략 비교 · 분할매수 · MDD 트리거 · DCA · 현금비율 최적화
          </p>
        </div>
      </div>

      {/* Config */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-300">설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tickers */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500">종목 티커 (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {tickers.map(t => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1 bg-zinc-800 text-zinc-200 border-zinc-700">
                  {t}
                  <button onClick={() => setTickers(p => p.filter(x => x !== t))} className="hover:text-red-400 transition">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <input className="h-7 w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 outline-none focus:border-amber-500 transition"
                  placeholder="TSLA" value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && addTicker()} />
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-zinc-700" onClick={() => addTicker()}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TICKERS.map(t => (
                <button key={t} onClick={() => tickers.includes(t) ? setTickers(p => p.filter(x => x !== t)) : addTicker(t)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                    tickers.includes(t) ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Period + Cash */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">기간</label>
              <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/80 p-1">
                {PERIODS.map(({ key, label }) => (
                  <button key={key} onClick={() => setPeriod(key)}
                    className={cn("rounded px-3 py-1 text-xs font-semibold transition",
                      period === key ? "bg-amber-600 text-white shadow" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">초기 자본 ($)</label>
              <input type="number" min={100} step={1000}
                className="h-9 w-36 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:border-amber-500 transition"
                value={initialCash} onChange={e => setInitialCash(Number(e.target.value))} />
            </div>
          </div>

          <Button onClick={run} disabled={loading || tickers.length === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />분석 중...</> : <><Play className="h-4 w-4" />전략 비교 실행</>}
          </Button>
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
        </CardContent>
      </Card>

      {/* Results */}
      {results && currentResults.length > 0 && (
        <div className="space-y-4">
          {/* Ticker tabs */}
          {tickers.length > 1 && (
            <div className="flex gap-2">
              {tickers.map(t => (
                <button key={t} onClick={() => setActiveTicker(t)}
                  className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                    activeTicker === t ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Best strategy highlight */}
          {bestResult && <BestStrategyCard result={bestResult} ticker={activeTicker} />}

          {/* Quick rank bar */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
                <Target className="h-4 w-4 text-amber-400" />
                종합 순위 (CAGR 40% · 샤프 30% · MDD 30%)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...currentResults].sort((a, b) => a.rank - b.rank).map(r => {
                const maxCagr = Math.max(...currentResults.map(x => x.cagr));
                const barW = Math.max(4, (r.cagr / (maxCagr || 1)) * 100);
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm shrink-0">{RANK_MEDALS[r.rank - 1] ?? `${r.rank}`}</span>
                    <div className="w-32 shrink-0 flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: STRATEGY_COLORS[r.id] }} />
                      <span className="text-xs text-zinc-300 truncate">{r.name}</span>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: STRATEGY_COLORS[r.id] + "cc" }} />
                    </div>
                    <span className={cn("w-16 text-right text-xs font-semibold tabular-nums shrink-0", cagrColor(r.cagr))}>
                      {fmt(r.cagr)}%
                    </span>
                    <span className="w-12 text-right text-[10px] text-zinc-600 tabular-nums shrink-0">
                      MDD {r.mdd.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-0">
              <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-3">
                {([
                  { key: "chart", label: "수익률 차트" },
                  { key: "ranking", label: "상세 순위표" },
                  { key: "yearly", label: "연도별 수익" },
                  { key: "detail", label: "매수 로그" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={cn("rounded px-3 py-1 text-xs font-semibold transition",
                      activeTab === key ? "bg-amber-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200")}>
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeTab === "chart" && <EquityChart results={currentResults} ticker={activeTicker} />}
              {activeTab === "ranking" && (
                <RankingTable results={currentResults} onSelectDetail={id => { setDetailId(id); setActiveTab("detail"); }} />
              )}
              {activeTab === "yearly" && <YearlyChart results={currentResults} />}
              {activeTab === "detail" && (
                <div className="space-y-4">
                  {/* Strategy selector */}
                  <div className="flex flex-wrap gap-1.5">
                    {currentResults.map(r => (
                      <button key={r.id} onClick={() => setDetailId(r.id)}
                        className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                          detailId === r.id ? "border-transparent text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-600")}
                        style={detailId === r.id ? { background: STRATEGY_COLORS[r.id] + "33", borderColor: STRATEGY_COLORS[r.id], color: STRATEGY_COLORS[r.id] } : undefined}>
                        {RANK_MEDALS[r.rank - 1] ?? `${r.rank}`} {r.name}
                      </button>
                    ))}
                  </div>

                  {detailResult ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-4 text-xs">
                        {[
                          { icon: TrendingUp, label: "CAGR", val: `${fmt(detailResult.cagr)}%`, color: cagrColor(detailResult.cagr) },
                          { icon: TrendingDown, label: "MDD", val: `-${detailResult.mdd.toFixed(1)}%`, color: "text-red-400" },
                          { icon: Wallet, label: "총 투자금", val: `$${detailResult.totalDeployed.toLocaleString()}`, color: "text-zinc-300" },
                          { icon: Target, label: "평균단가", val: `$${detailResult.avgCost.toFixed(2)}`, color: "text-blue-400" },
                        ].map(({ icon: Icon, label, val, color }) => (
                          <div key={label} className="flex items-center gap-1.5 rounded-lg bg-zinc-800/60 px-3 py-2">
                            <Icon className="h-3.5 w-3.5 text-zinc-500" />
                            <span className="text-zinc-500">{label}</span>
                            <span className={cn("font-semibold", color)}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <DeploymentLog result={detailResult} />
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-zinc-600">위에서 전략을 선택하세요</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!results && !loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-zinc-500">
          <Wallet className="h-14 w-14 opacity-20" />
          <p className="text-base font-medium">종목과 기간을 선택 후 전략 비교를 실행하세요</p>
          <p className="text-sm opacity-70">10가지 자금관리 전략을 동시에 비교합니다</p>
        </div>
      )}
    </div>
  );
}
