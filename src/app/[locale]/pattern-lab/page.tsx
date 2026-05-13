"use client";

import { useState, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { GitCompare, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatternMatchResponse, PatternMatch } from "@/app/api/pattern-match/route";

// ── 상수 ────────────────────────────────────────────────────────────────────

const SYMBOLS = [
  { value: "^IXIC",   label: "NASDAQ" },
  { value: "^GSPC",   label: "S&P 500" },
  { value: "^KS11",   label: "KOSPI" },
  { value: "^KQ11",   label: "KOSDAQ" },
  { value: "^DJI",    label: "Dow Jones" },
  { value: "^N225",   label: "Nikkei 225" },
  { value: "GC=F",    label: "Gold" },
  { value: "BTC-USD", label: "Bitcoin" },
];

const LOOKBACKS = [
  { value: 20,  label: "20일" },
  { value: 40,  label: "40일" },
  { value: 60,  label: "60일" },
  { value: 90,  label: "90일" },
  { value: 120, label: "120일" },
];

const FORWARDS = [
  { value: 30,  label: "30일" },
  { value: 60,  label: "60일" },
  { value: 90,  label: "90일" },
  { value: 120, label: "120일" },
  { value: 180, label: "180일" },
];

const MATCH_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444",
];

// ── 유틸 ────────────────────────────────────────────────────────────────────

function fmtPct(v: number, plusSign = true) {
  const s = v >= 0 && plusSign ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function fmtDate(d: string) {
  return d.slice(0, 7); // YYYY-MM
}

// ── 차트 툴팁 ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-zinc-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-zinc-300">{p.name}:</span>
          <span className={cn("font-mono font-semibold", p.value >= 0 ? "text-emerald-400" : "text-red-400")}>
            {fmtPct(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function PatternLabPage() {
  const [symbol,   setSymbol]   = useState("^IXIC");
  const [lookback, setLookback] = useState(60);
  const [forward,  setForward]  = useState(90);
  const [topK,     setTopK]     = useState(5);
  const [data,     setData]     = useState<PatternMatchResponse | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedMatch(null);
    try {
      const params = new URLSearchParams({ symbol, lookback: String(lookback), forward: String(forward), topK: String(topK) });
      const res  = await fetch(`/api/pattern-match?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "분석 실패");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [symbol, lookback, forward, topK]);

  // ── 비교 구간 차트 데이터 ────────────────────────────────────────────────
  const compareChartData = useMemo(() => {
    if (!data) return [];
    const len = data.lookback;
    return Array.from({ length: len }, (_, i) => {
      const point: Record<string, number | string> = {
        day: `D-${len - i}`,
        현재: parseFloat((data.currentNorm[i] ?? 0).toFixed(3)),
      };
      data.matches.forEach((m, mi) => {
        if (selectedMatch === null || selectedMatch === mi) {
          point[`유사${mi + 1} (${fmtDate(m.startDate)})`] = parseFloat((m.windowNorm[i] ?? 0).toFixed(3));
        }
      });
      return point;
    });
  }, [data, selectedMatch]);

  // ── 이후 구간 차트 데이터 ────────────────────────────────────────────────
  const forwardChartData = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: data.forward }, (_, i) => {
      const point: Record<string, number | string> = { day: `+${i + 1}일` };
      data.matches.forEach((m, mi) => {
        if (selectedMatch === null || selectedMatch === mi) {
          const v = m.forwardNorm[i];
          if (v != null) point[`유사${mi + 1} (${fmtDate(m.startDate)})`] = parseFloat(v.toFixed(3));
        }
      });
      return point;
    });
  }, [data, selectedMatch]);

  const symbolName = SYMBOLS.find((s) => s.value === symbol)?.label ?? symbol;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
          <GitCompare className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">패턴 유사도 분석</h1>
          <p className="text-sm text-muted-foreground">현재 지수 흐름과 가장 유사한 과거 구간을 찾아 이후 전개를 비교합니다</p>
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 지수 선택 */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">지수</p>
            <div className="flex flex-wrap gap-1">
              {SYMBOLS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSymbol(s.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    symbol === s.value
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* 비교 기간 */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">비교 기간</p>
            <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
              {LOOKBACKS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLookback(l.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    lookback === l.value ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* 예측 기간 */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">예측 기간</p>
            <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
              {FORWARDS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setForward(f.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    forward === f.value ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 매칭 수 */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">유사 구간 수</p>
            <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
              {[3, 5, 7].map((k) => (
                <button
                  key={k}
                  onClick={() => setTopK(k)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    topK === k ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k}개
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors ml-auto"
          >
            {loading
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <GitCompare className="h-4 w-4" />}
            {loading ? "분석 중..." : "패턴 분석"}
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin opacity-40" />
          <p className="text-sm">10년 데이터에서 유사 패턴 검색 중...</p>
        </div>
      )}

      {/* 결과 */}
      {data && !loading && (
        <div className="space-y-6">
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">분석 지수</p>
              <p className="mt-1 text-lg font-bold text-violet-400">{data.displayName}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">유사 구간 평균 이후 수익률 ({forward}일)</p>
              <p className={cn("mt-1 text-lg font-bold tabular-nums", data.avgForwardReturn >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtPct(data.avgForwardReturn)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">상승 케이스</p>
              <p className="mt-1 text-lg font-bold text-emerald-400">{data.bullishCount} / {data.matches.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">최고 유사도</p>
              <p className="mt-1 text-lg font-bold text-blue-400">{data.matches[0]?.similarityPct ?? 0}%</p>
            </div>
          </div>

          {/* 유사 구간 테이블 */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <h2 className="text-sm font-semibold">유사 구간 TOP {data.matches.length}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">클릭하면 해당 구간만 차트에 표시됩니다</p>
            </div>
            <div className="divide-y divide-border/60">
              {data.matches.map((m: PatternMatch, i: number) => {
                const isSelected = selectedMatch === i;
                const color = MATCH_COLORS[i] ?? "#6b7280";
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedMatch(isSelected ? null : i)}
                    className={cn(
                      "flex w-full items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/20",
                      isSelected && "bg-muted/30"
                    )}
                  >
                    {/* 순위 */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: color }}>
                      {i + 1}
                    </div>

                    {/* 기간 */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground/90">
                        {m.startDate} ~ {m.endDate}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">유사도 {m.similarityPct}%</p>
                    </div>

                    {/* 유사도 바 */}
                    <div className="hidden sm:block w-24">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${m.similarityPct}%`, background: color }} />
                      </div>
                    </div>

                    {/* 이후 결과 */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className={cn("font-mono text-sm font-semibold", m.forwardReturn >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {m.forwardReturn >= 0 ? <TrendingUp className="inline h-3.5 w-3.5 mr-0.5" /> : <TrendingDown className="inline h-3.5 w-3.5 mr-0.5" />}
                        {fmtPct(m.forwardReturn)}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        고점 {fmtPct(m.peakReturn)} / 저점 {fmtPct(m.troughReturn, false)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 현재 vs 유사 구간 비교 차트 */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold">패턴 비교 ({lookback}일)</h2>
            <p className="mb-4 text-xs text-muted-foreground">현재 패턴(굵은 선)과 과거 유사 구간을 겹쳐 비교</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={compareChartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#52525b" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* 과거 유사 구간 */}
                {data.matches.map((m, i) => {
                  if (selectedMatch !== null && selectedMatch !== i) return null;
                  const key = `유사${i + 1} (${fmtDate(m.startDate)})`;
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={MATCH_COLORS[i] ?? "#6b7280"}
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="4 2"
                      strokeOpacity={0.7}
                    />
                  );
                })}
                {/* 현재 패턴 */}
                <Line
                  type="monotone"
                  dataKey="현재"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 이후 전개 예측 차트 */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold">이후 전개 ({forward}일) — 유사 구간의 실제 흐름</h2>
            <p className="mb-4 text-xs text-muted-foreground">각 유사 구간이 끝난 시점을 0%로 놓고, 이후 {forward}일간의 실제 흐름</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={forwardChartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={Math.floor(forward / 6)} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#52525b" strokeWidth={1.5} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.matches.map((m, i) => {
                  if (selectedMatch !== null && selectedMatch !== i) return null;
                  const key = `유사${i + 1} (${fmtDate(m.startDate)})`;
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={MATCH_COLORS[i] ?? "#6b7280"}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* 요약 통계 */}
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              {[
                {
                  label: `평균 이후 수익률 (${forward}일)`,
                  value: fmtPct(data.avgForwardReturn),
                  color: data.avgForwardReturn >= 0 ? "text-emerald-400" : "text-red-400",
                  icon: data.avgForwardReturn >= 0 ? TrendingUp : data.avgForwardReturn < 0 ? TrendingDown : Minus,
                },
                {
                  label: "평균 최고 수익률",
                  value: fmtPct(data.matches.reduce((s, m) => s + m.peakReturn, 0) / data.matches.length),
                  color: "text-emerald-400",
                  icon: TrendingUp,
                },
                {
                  label: "평균 최저 수익률",
                  value: fmtPct(data.matches.reduce((s, m) => s + m.troughReturn, 0) / data.matches.length, false),
                  color: "text-red-400",
                  icon: TrendingDown,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-muted/30 px-3 py-2.5">
                  <p className="text-muted-foreground">{s.label}</p>
                  <div className={cn("mt-1 flex items-center justify-center gap-1 font-mono font-bold", s.color)}>
                    <s.icon className="h-3.5 w-3.5" />
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-zinc-600">
            * 과거 유사도 분석은 참고용이며 미래 수익을 보장하지 않습니다. Yahoo Finance 10년 데이터 기준 · 1시간 캐시 · Pearson 상관계수 기반
          </p>
        </div>
      )}

      {/* 초기 안내 */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <GitCompare className="h-12 w-12 opacity-20" />
          <p className="text-sm font-medium text-center max-w-sm">
            지수와 기간을 선택하고 <b className="text-foreground">패턴 분석</b>을 실행하세요
          </p>
          <p className="text-xs text-center max-w-sm leading-relaxed">
            현재 {symbolName}의 최근 {lookback}일 흐름과 가장 유사한 과거 구간 {topK}개를 찾아<br />
            이후 {forward}일간 실제 전개를 보여줍니다
          </p>
        </div>
      )}
    </div>
  );
}
