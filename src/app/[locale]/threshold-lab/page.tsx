"use client";

import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ThresholdLabResponse } from "@/app/api/threshold-lab/route";

const YEAR_OPTS = [1, 2, 3, 5];

function pct(v: number, d = 1) { return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }
function colorOf(v: number) { return v >= 0 ? "text-emerald-400" : "text-red-400"; }

/** 그리드 셀 배경: 수익률을 -100~+200 범위로 매핑한 초록/빨강 음영 */
function gridBg(v: number, max: number) {
  if (v >= 0) {
    const a = max > 0 ? Math.min(0.85, 0.12 + (v / max) * 0.73) : 0.2;
    return `rgba(16,185,129,${a.toFixed(2)})`;
  }
  const a = Math.min(0.6, 0.12 + (Math.abs(v) / 60) * 0.48);
  return `rgba(239,68,68,${a.toFixed(2)})`;
}

export default function ThresholdLabPage() {
  const [ticker, setTicker] = useState("");
  const [years, setYears] = useState(3);
  const [buyDrop, setBuyDrop] = useState(5);
  const [sellRise, setSellRise] = useState(10);
  const [stop, setStop] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ThresholdLabResponse | null>(null);

  const run = async (overrides?: { buyDrop?: number; sellRise?: number }) => {
    const tk = ticker.trim().toUpperCase();
    if (!tk) { setError("종목 코드를 입력하세요 (예: AAPL, 005930)"); return; }
    const bd = overrides?.buyDrop ?? buyDrop;
    const sr = overrides?.sellRise ?? sellRise;
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ ticker: tk, years: String(years), buyDrop: String(bd), sellRise: String(sr) });
      if (stop !== "" && Number(stop) > 0) q.set("stop", String(stop));
      const res = await fetch(`/api/threshold-lab?${q}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "실패");
      setData(j);
      setTicker(tk);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = () => {
    if (!data) return;
    setBuyDrop(data.suggestion.buyDrop);
    setSellRise(data.suggestion.sellRise);
    run({ buyDrop: data.suggestion.buyDrop, sellRise: data.suggestion.sellRise });
  };

  const gridMax = data ? Math.max(1, ...data.grid.map((g) => g.totalReturn)) : 1;
  const isKrw = data ? /^\d/.test(data.ticker) : false;

  return (
    <div className="space-y-6">
      <div className="topbar">
        <div>
          <div className="crumb">분석 랩</div>
          <h1>변동성·임계값 매매 랩</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-2">
        한 종목을 <b>고점 대비 X% 하락 시 매수 · 매수가 대비 Y% 상승 시 매도</b> 규칙으로 백테스트하고,
        기간별 변동성 변화와 최적 임계값을 찾아줍니다.
      </p>

      {/* 입력 */}
      <div className="card">
        <div className="card-body card-body-padded">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              종목 코드
              <input
                className="w-36 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="AAPL / 005930"
                value={ticker} onChange={(e) => setTicker(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              기간
              <select className="w-20 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" value={years} onChange={(e) => setYears(Number(e.target.value))}>
                {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              매수: 고점比 하락 %
              <input type="number" className="w-28 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" value={buyDrop} min={1} max={50}
                onChange={(e) => setBuyDrop(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              매도: 매수比 상승 %
              <input type="number" className="w-28 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" value={sellRise} min={1} max={100}
                onChange={(e) => setSellRise(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              손절 % (선택)
              <input type="number" className="w-24 rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" value={stop} min={1} max={90} placeholder="없음"
                onChange={(e) => setStop(e.target.value === "" ? "" : Number(e.target.value))} />
            </label>
            <button className="btn btn-primary" onClick={() => run()} disabled={loading}>
              {loading ? "계산 중…" : "백테스트 실행"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {data && (
        <>
          {/* 추천 */}
          <div className="card border-amber-500/30">
            <div className="card-body card-body-padded">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">💡 추천 임계값</span>
                  <div className="mt-0.5 text-lg font-bold">
                    매수 <span className="text-emerald-400">-{data.suggestion.buyDrop}%</span>
                    {" · "}매도 <span className="text-emerald-400">+{data.suggestion.sellRise}%</span>
                  </div>
                </div>
                <button className="btn btn-sm" onClick={applySuggestion}>추천값 적용</button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{data.suggestion.rationale}</p>
            </div>
          </div>

          {/* 백테스트 지표 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="전략 총수익" value={pct(data.totalReturn)} color={colorOf(data.totalReturn)} />
            <Stat label="매수후보유" value={pct(data.buyHoldReturn)} color={colorOf(data.buyHoldReturn)} />
            <Stat label="CAGR" value={pct(data.cagr)} color={colorOf(data.cagr)} />
            <Stat label="최대낙폭(MDD)" value={pct(data.mdd)} color="text-red-400" />
            <Stat label="승률" value={`${data.winRate.toFixed(0)}%`} />
            <Stat label="거래 횟수" value={`${data.totalTrades}회`} />
          </div>

          {/* 자산 곡선 */}
          <Card title={`자산 곡선 — 전략 vs 매수후보유 (${data.name})`}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false}
                  minTickGap={50} tickFormatter={(d: string) => d.slice(2, 7)} />
                <YAxis tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={48}
                  tickFormatter={(v: number) => `${(v / 10000 * 100 - 100).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, n: any) => [`${((v as number) / 10000 * 100 - 100).toFixed(1)}%`, n === "strategy" ? "전략" : "매수후보유"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "strategy" ? "전략" : "매수후보유")} />
                <Line dataKey="strategy" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line dataKey="buyhold" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 변동성 추이 */}
          <Card title="기간별 변동성 추이 (연율화 HV)">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.volSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false}
                  minTickGap={50} tickFormatter={(d: string) => d.slice(2, 7)} />
                <YAxis tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, n: any) => [v == null ? "—" : `${(v as number).toFixed(1)}%`, n === "hv20" ? "20일 HV" : "60일 HV"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "hv20" ? "20일 HV" : "60일 HV")} />
                <Line dataKey="hv20" stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="hv60" stroke="#f472b6" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="py-1.5 text-left font-medium">연도</th>
                    <th className="py-1.5 text-right font-medium">평균 변동성</th>
                    <th className="py-1.5 text-right font-medium">최저</th>
                    <th className="py-1.5 text-right font-medium">최고</th>
                    <th className="py-1.5 text-right font-medium">가격 수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byYear.map((y) => (
                    <tr key={y.year} className="border-b border-border/30">
                      <td className="py-1.5 font-mono text-muted-foreground">{y.year}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{y.avgHv20.toFixed(0)}%</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{y.minHv20.toFixed(0)}%</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{y.maxHv20.toFixed(0)}%</td>
                      <td className={cn("py-1.5 text-right tabular-nums font-medium", colorOf(y.priceReturn))}>{pct(y.priceReturn, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              현재 20일 HV {data.currentHv20.toFixed(0)}% · 60일 HV {data.currentHv60.toFixed(0)}% · 일간 변동성 ±{data.dailySigmaPct.toFixed(1)}% · ATR {data.atrPct.toFixed(1)}%
            </p>
          </Card>

          {/* 그리드 서치 */}
          <Card title="임계값 그리드 — 총수익률 (행: 매수 하락% · 열: 매도 상승%)">
            <div className="overflow-x-auto">
              <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="p-1.5 text-muted-foreground">매수↓ \ 매도↑</th>
                    {data.sellRiseOptions.map((s) => <th key={s} className="p-1.5 text-center text-muted-foreground">+{s}%</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.buyDropOptions.map((b) => (
                    <tr key={b}>
                      <td className="p-1.5 text-right font-medium text-muted-foreground">-{b}%</td>
                      {data.sellRiseOptions.map((s) => {
                        const cell = data.grid.find((g) => g.buyDrop === b && g.sellRise === s)!;
                        const isBest = b === data.suggestion.buyDrop && s === data.suggestion.sellRise;
                        return (
                          <td key={s}
                            className={cn("p-1.5 text-center rounded tabular-nums whitespace-nowrap", isBest && "ring-2 ring-amber-400")}
                            style={{ background: gridBg(cell.totalReturn, gridMax) }}
                            title={`매수 -${b}% / 매도 +${s}% · 총수익 ${cell.totalReturn.toFixed(0)}% · 거래 ${cell.trades}회 · 승률 ${cell.winRate.toFixed(0)}%`}
                          >
                            <div className="font-semibold text-white">{cell.totalReturn.toFixed(0)}%</div>
                            <div className="text-[10px] text-white/70">{cell.trades}회</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">칸 위에 마우스를 올리면 승률·거래수가 표시됩니다. 노란 테두리가 추천 조합입니다. 거래 수가 너무 적은 조합은 과최적화일 수 있어요.</p>
          </Card>

          {/* 거래 내역 */}
          {data.trades.length > 0 && (
            <Card title={`매매 내역 (${data.totalTrades}회 청산${data.trades.some(t => t.exitDate === null) ? " + 보유중" : ""})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="py-1.5 text-left font-medium">매수일</th>
                      <th className="py-1.5 text-right font-medium">매수가</th>
                      <th className="py-1.5 text-left font-medium pl-4">매도일</th>
                      <th className="py-1.5 text-right font-medium">매도가</th>
                      <th className="py-1.5 text-right font-medium">손익</th>
                      <th className="py-1.5 text-center font-medium">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trades.map((t, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5 font-mono text-muted-foreground">{t.entryDate}</td>
                        <td className="py-1.5 text-right tabular-nums">{t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: isKrw ? 0 : 2 })}</td>
                        <td className="py-1.5 font-mono text-muted-foreground pl-4">{t.exitDate ?? "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{t.exitPrice != null ? t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: isKrw ? 0 : 2 }) : "—"}</td>
                        <td className={cn("py-1.5 text-right tabular-nums font-medium", t.pnlPct != null && colorOf(t.pnlPct))}>{t.pnlPct != null ? pct(t.pnlPct) : "—"}</td>
                        <td className="py-1.5 text-center text-xs text-muted-foreground">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            ※ 과거 데이터 기반 단순 시뮬레이션으로, 수수료·슬리피지·세금은 반영하지 않았습니다. 미래 수익을 보장하지 않습니다.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <div className="card-body card-body-padded">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-lg font-bold tabular-nums", color)}>{value}</p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-head"><div><h3 className="card-title">{title}</h3></div></div>
      <div className="card-body card-body-padded">{children}</div>
    </div>
  );
}
