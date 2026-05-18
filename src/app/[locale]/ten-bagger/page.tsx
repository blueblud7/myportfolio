"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Play, TrendingUp, BarChart2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenBaggerCacheRow } from "@/app/api/ten-bagger/route";
import { INDEX_LABELS, type IndexName } from "@/lib/index-tickers";

const INDICES = ["NASDAQ100", "SP100", "KOSPI"] as const;

// ─── 배수 뱃지 색상 ──────────────────────────────────────────────────────────
function multipleBadgeClass(v: number | null): string {
  if (v == null) return "bg-zinc-800 text-zinc-500";
  if (v >= 5) return "bg-purple-900/60 text-purple-300 border border-purple-700/50";
  if (v >= 3) return "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50";
  if (v >= 2) return "bg-blue-900/60 text-blue-300 border border-blue-700/50";
  if (v >= 1.5) return "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50";
  return "bg-zinc-800 text-zinc-500";
}

function MultipleBadge({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-xs font-mono font-semibold",
          multipleBadgeClass(value),
        )}
      >
        {value != null ? `${value.toFixed(2)}x` : "—"}
      </span>
    </div>
  );
}

// ─── 스파크라인 ──────────────────────────────────────────────────────────────
function Sparkline({ data, score }: { data: number[]; score: number }) {
  if (data.length < 2) return <div className="h-10 w-full rounded bg-muted/20" />;
  const W = 160;
  const H = 40;
  const P = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = P + (1 - (v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const isUp = data[data.length - 1] >= data[0];
  const color =
    score >= 60
      ? isUp
        ? "#10b981"
        : "#ef4444"
      : score >= 40
        ? isUp
          ? "#3b82f6"
          : "#f97316"
        : "#52525b";
  const fillPts = [`${P},${H}`, ...pts, `${(W - P).toFixed(1)},${H}`].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full">
      <polygon points={fillPts} fill={color} opacity={0.15} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── 52주 범위 바 ────────────────────────────────────────────────────────────
function RangeBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-zinc-600 text-xs">—</span>;
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    pct >= 85
      ? "bg-red-500"
      : pct >= 50
        ? "bg-emerald-500"
        : "bg-yellow-500";
  return (
    <div className="flex flex-col gap-1 w-16">
      <div className="relative h-1.5 w-full rounded-full bg-zinc-700">
        <div
          className={cn("absolute left-0 h-full rounded-full", color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-400 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ─── 점수 뱃지 ───────────────────────────────────────────────────────────────
function ScoreBadge({ score, signals }: { score: number; signals: number }) {
  const cls =
    score >= 70
      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40"
      : score >= 50
        ? "bg-blue-900/60 text-blue-300 border border-blue-700/40"
        : score >= 30
          ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700/40"
          : "bg-zinc-800 text-zinc-400";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("rounded px-2 py-0.5 text-sm font-bold", cls)}>{score}</span>
      <span className="text-[10px] text-zinc-500">{signals}/3 신호</span>
    </div>
  );
}

// ─── 볼륨 뱃지 ───────────────────────────────────────────────────────────────
function VolumeBadge({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="text-zinc-600 text-xs">—</span>;
  const cls =
    ratio >= 2.0
      ? "text-emerald-400"
      : ratio >= 1.3
        ? "text-yellow-400"
        : "text-zinc-500";
  return <span className={cn("font-mono text-xs", cls)}>{ratio.toFixed(2)}x</span>;
}

export default function TenBaggerPage() {
  const [index, setIndex] = useState<IndexName>("NASDAQ100");
  const [results, setResults] = useState<TenBaggerCacheRow[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ analyzed: 0, total: 0 });
  const [minScore, setMinScore] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const loadCache = async (idx: IndexName) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ten-bagger?index=${idx}&minScore=${minScore}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setDate(data.date ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCache(index);
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const startScan = (force = false) => {
    esRef.current?.close();
    setScanning(true);
    setProgress({ analyzed: 0, total: 0 });

    const url = `/api/ten-bagger/stream?index=${index}${force ? "&force=true" : ""}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start") {
        setProgress({ analyzed: msg.analyzed, total: msg.total });
      } else if (msg.type === "progress") {
        setProgress({ analyzed: msg.analyzed, total: msg.total });
      } else if (msg.type === "done") {
        es.close();
        setScanning(false);
        loadCache(index);
      } else if (msg.type === "error") {
        es.close();
        setScanning(false);
      }
    };
    es.onerror = () => {
      es.close();
      setScanning(false);
    };
  };

  const pct = progress.total > 0 ? (progress.analyzed / progress.total) * 100 : 0;
  const filtered = minScore > 0 ? results.filter((r) => r.score >= minScore) : results;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">텐베거 후보 스크리너</h1>
        <p className="mt-1 text-sm text-zinc-400">
          3가지 기준으로 측정한 상승 배수 — 52주 저점 · 로컬 미니마 · 수급 돌파
        </p>
      </div>

      {/* 신호 설명 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="flex items-start gap-3 p-4">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <div>
              <p className="text-xs font-semibold text-blue-300">52주 저점 기준</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                연간 최저가 대비 현재가. 빠르고 객관적. 시장이 이미 인정한 상승.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="flex items-start gap-3 p-4">
            <BarChart2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">로컬 미니마 기준</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                가장 최근 유의미한 스윙 저점(15%↓) 대비. 실제 추세 전환점 기준.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="flex items-start gap-3 p-4">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
            <div>
              <p className="text-xs font-semibold text-yellow-300">수급 돌파 기준</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                최초 거래량 급등일(평균 2.5배↑ 양봉) 가격 대비. 수급 쏠림 시작점.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Index Tabs */}
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5">
          {INDICES.map((idx) => (
            <button
              key={idx}
              onClick={() => setIndex(idx)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                index === idx
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {INDEX_LABELS[idx]}
            </button>
          ))}
        </div>

        {/* Min score filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">최소 점수</span>
          {[0, 30, 50, 70].map((s) => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                minScore === s
                  ? "bg-zinc-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {s === 0 ? "전체" : `${s}+`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {date && (
            <span className="text-xs text-zinc-500">
              최근 분석: {date}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadCache(index)}
            disabled={loading || scanning}
            className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={() => startScan(false)}
            disabled={scanning}
            className="h-8 bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {scanning ? "분석 중..." : "스캔"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => startScan(true)}
            disabled={scanning}
            className="h-8 border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-xs"
          >
            강제 재분석
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>스캔 중...</span>
            <span>{progress.analyzed} / {progress.total}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Results table */}
      {loading ? (
        <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          {results.length === 0
            ? "분석 결과가 없습니다. 스캔 버튼을 눌러 분석을 시작하세요."
            : "선택한 최소 점수 이상의 종목이 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">종목</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">가격</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-blue-400">
                  52주<br />저점 기준
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-emerald-400">
                  로컬<br />미니마
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-yellow-400">
                  수급<br />돌파
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-zinc-500">
                  수급<br />강도
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-zinc-500">
                  52주<br />위치
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-zinc-500">차트</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-zinc-500">점수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.ticker}
                  className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-3 py-3 text-zinc-500 text-xs">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div>
                      <span className="font-mono font-semibold text-white text-sm">
                        {row.ticker}
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-0.5 max-w-[140px] truncate">
                        {row.name}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-zinc-200">
                    {row.currency === "KRW"
                      ? row.price.toLocaleString()
                      : row.price.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <MultipleBadge value={row.from52wLow} label={row.low52w != null ? `$${row.low52w < 10 ? row.low52w.toFixed(2) : row.low52w.toFixed(0)}` : ""} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <MultipleBadge
                      value={row.fromLocalMin}
                      label={row.localMinDate ? row.localMinDate.slice(5) : ""}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <MultipleBadge
                      value={row.fromVolBase}
                      label={row.volBaseDate ? row.volBaseDate.slice(5) : ""}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <VolumeBadge ratio={row.volumeRatio} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <RangeBar pct={row.recoveryPct} />
                  </td>
                  <td className="px-3 py-3">
                    <Sparkline data={row.sparkline} score={row.score} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ScoreBadge score={row.score} signals={row.signalsCount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
