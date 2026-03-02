"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Play, Plus, X, TrendingUp, TrendingDown, BarChart2, Target, Award } from "lucide-react";

interface Trade {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: "rsi_crossdown" | "trailing_stop";
}

interface EquityPoint {
  date: string;
  value: number;
  [key: string]: string | number;
}

interface BacktestResult {
  ticker: string;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number;
  totalTrades: number;
  buyHoldReturn: number;
  equityCurve: EquityPoint[];
  trades: Trade[];
  yearlyReturns: { year: number; return: number }[];
}

const LINE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const PRESET_UNIVERSES = [
  { label: "빅테크", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"] },
  { label: "S&P 대표", tickers: ["SPY", "QQQ", "AAPL", "MSFT", "TSLA"] },
  { label: "한국 ADR", tickers: ["SKM", "KB", "SHG"] },
];

export default function BacktestPage() {
  const [tickers, setTickers] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);
  const [tickerInput, setTickerInput] = useState("");
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rsiOb, setRsiOb] = useState(80);
  const [trailPct, setTrailPct] = useState(25);
  const [initialCash, setInitialCash] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chart" | "trades" | "yearly">("chart");

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) {
      setTickers([...tickers, t]);
    }
    setTickerInput("");
  };

  const removeTicker = (t: string) => setTickers(tickers.filter((x) => x !== t));

  const runBacktest = async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, start, end, rsiOb, trailPct, initialCash }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // 자산 곡선 병합 (날짜 기준 통합)
  const mergedCurve = (() => {
    if (results.length === 0) return [];
    const dateSet = new Set<string>();
    for (const r of results) for (const p of r.equityCurve) dateSet.add(p.date);
    const dates = [...dateSet].sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const r of results) {
        const point = r.equityCurve.find((p) => p.date === date);
        if (point) row[r.ticker] = point.value;
      }
      return row;
    });
  })();

  const allTrades = results.flatMap((r) => r.trades).sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  const allYearly = (() => {
    if (results.length === 0) return [];
    const yearSet = new Set<number>();
    for (const r of results) for (const y of r.yearlyReturns) yearSet.add(y.year);
    const years = [...yearSet].sort();
    return years.map((year) => {
      const row: Record<string, string | number> = { year: String(year) };
      for (const r of results) {
        const y = r.yearlyReturns.find((yy) => yy.year === year);
        row[r.ticker] = y ? y.return : 0;
      }
      return row;
    });
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">백테스트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CANSLIM + RSI 전략 — 52주 최고가 돌파 매수 / RSI 크로스다운 or 트레일링 스탑 매도
        </p>
      </div>

      {/* 파라미터 설정 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">전략 파라미터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 프리셋 */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">프리셋:</span>
            {PRESET_UNIVERSES.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setTickers(p.tickers)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* 종목 입력 */}
          <div>
            <label className="text-xs text-muted-foreground">종목 (티커)</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tickers.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1">
                  {t}
                  <button onClick={() => removeTicker(t)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <input
                  className="h-6 w-24 rounded border bg-transparent px-2 text-xs outline-none ring-offset-background focus:ring-1 focus:ring-ring"
                  placeholder="TSLA"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTicker()}
                />
                <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={addTicker}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* 기간 + 수치 파라미터 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="text-xs text-muted-foreground">시작일</label>
              <input
                type="date"
                className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">종료일</label>
              <input
                type="date"
                className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">RSI 과매수 ({rsiOb})</label>
              <input
                type="range"
                min={60}
                max={90}
                step={5}
                className="mt-2 w-full"
                value={rsiOb}
                onChange={(e) => setRsiOb(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">트레일링 스탑 ({trailPct}%)</label>
              <input
                type="range"
                min={10}
                max={40}
                step={5}
                className="mt-2 w-full"
                value={trailPct}
                onChange={(e) => setTrailPct(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">초기 자본 ($)</label>
              <input
                type="number"
                className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm"
                value={initialCash}
                onChange={(e) => setInitialCash(Number(e.target.value))}
              />
            </div>
          </div>

          <Button onClick={runBacktest} disabled={loading || tickers.length === 0} className="w-full sm:w-auto">
            <Play className="mr-2 h-4 w-4" />
            {loading ? "백테스트 실행 중..." : "백테스트 실행"}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* 결과 */}
      {results.length > 0 && (
        <>
          {/* 성과 요약 카드 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((r, i) => (
              <Card key={r.ticker} className={cn("border-l-4")} style={{ borderLeftColor: LINE_COLORS[i % LINE_COLORS.length] }}>
                <CardHeader className="pb-1">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{r.ticker}</span>
                    <Badge variant={r.totalReturn >= 0 ? "default" : "destructive"} className="text-xs">
                      {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(1)}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />CAGR</span>
                    <span className={cn("font-semibold", r.cagr >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {r.cagr.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" />MDD</span>
                    <span className="font-semibold text-red-400">-{r.mdd.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><BarChart2 className="h-3 w-3" />Sharpe</span>
                    <span className={cn("font-semibold", r.sharpe >= 1 ? "text-emerald-500" : r.sharpe >= 0 ? "text-yellow-500" : "text-red-500")}>
                      {r.sharpe.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3" />승률</span>
                    <span className="font-semibold">{r.winRate.toFixed(0)}% ({r.totalTrades}회)</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />B&H 대비</span>
                    <span className={cn("font-semibold", r.totalReturn - r.buyHoldReturn >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {(r.totalReturn - r.buyHoldReturn).toFixed(1)}%p
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 탭 차트 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">분석 결과</CardTitle>
              <div className="flex gap-1">
                {(["chart", "yearly", "trades"] as const).map((tab) => (
                  <Button
                    key={tab}
                    size="sm"
                    variant={activeTab === tab ? "default" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === "chart" ? "자산 곡선" : tab === "yearly" ? "연도별 수익" : "거래 내역"}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === "chart" && (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={mergedCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} minTickGap={40} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toLocaleString()}`} width={70} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, ""]}
                      labelFormatter={(l) => String(l)}
                      contentStyle={{ fontSize: 12, borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {results.map((r, i) => (
                      <Line key={r.ticker} type="monotone" dataKey={r.ticker} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}

              {activeTab === "yearly" && (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={allYearly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={50} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`${Number(v).toFixed(1)}%`, ""]}
                      labelFormatter={(l) => String(l)}
                      contentStyle={{ fontSize: 12, borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {results.map((r, i) => (
                      <Bar key={r.ticker} dataKey={r.ticker} fill={LINE_COLORS[i % LINE_COLORS.length]}>
                        {allYearly.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={(entry[r.ticker] as number) >= 0
                              ? LINE_COLORS[i % LINE_COLORS.length]
                              : "#ef4444"}
                          />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === "trades" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left font-medium">종목</th>
                        <th className="py-2 text-left font-medium">매수일</th>
                        <th className="py-2 text-left font-medium">매도일</th>
                        <th className="py-2 text-right font-medium">매수가</th>
                        <th className="py-2 text-right font-medium">매도가</th>
                        <th className="py-2 text-right font-medium">수익률</th>
                        <th className="py-2 text-right font-medium">손익</th>
                        <th className="py-2 text-center font-medium">매도 이유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTrades.map((t, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-1.5 font-medium">{t.ticker}</td>
                          <td className="py-1.5 text-muted-foreground">{t.entryDate}</td>
                          <td className="py-1.5 text-muted-foreground">{t.exitDate}</td>
                          <td className="py-1.5 text-right">${t.entryPrice.toFixed(2)}</td>
                          <td className="py-1.5 text-right">${t.exitPrice.toFixed(2)}</td>
                          <td className={cn("py-1.5 text-right font-semibold", t.pnlPct >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(1)}%
                          </td>
                          <td className={cn("py-1.5 text-right", t.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                            ${t.pnl.toFixed(0)}
                          </td>
                          <td className="py-1.5 text-center">
                            <Badge variant="outline" className="text-[10px]">
                              {t.reason === "rsi_crossdown" ? "RSI" : "Trail"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {allTrades.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">거래 내역이 없습니다.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {results.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <BarChart2 className="h-12 w-12 opacity-30" />
          <p>파라미터를 설정하고 백테스트를 실행하세요.</p>
          <p className="text-xs">CANSLIM 전략: 52주 최고가 돌파 매수, RSI 과매수 크로스다운 또는 트레일링 스탑 매도</p>
        </div>
      )}
    </div>
  );
}
