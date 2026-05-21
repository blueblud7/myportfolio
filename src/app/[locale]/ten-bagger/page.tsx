"use client";

import { useEffect, useRef, useState } from "react";
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="crumb">연구실</div>
          <h1>텐베거 후보 스크리너</h1>
        </div>
        <div className="right">
          <span className="fg-4" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
            3가지 기준으로 측정한 상승 배수
          </span>
        </div>
      </div>

      {/* 신호 설명 카드 */}
      <div className="stack-3">
        <div className="signal accent">
          <div className="signal-icon"><TrendingUp size={14}/></div>
          <div>
            <div className="signal-title" style={{ color: "var(--accent)" }}>52주 저점 기준</div>
            <div className="signal-sub">연간 최저가 대비 현재가. 빠르고 객관적.</div>
          </div>
        </div>
        <div className="signal up">
          <div className="signal-icon"><BarChart2 size={14}/></div>
          <div>
            <div className="signal-title" style={{ color: "var(--up)" }}>로컬 미니마 기준</div>
            <div className="signal-sub">스윙 저점(15%↓) 대비. 실제 추세 전환점.</div>
          </div>
        </div>
        <div className="signal warn">
          <div className="signal-icon"><Zap size={14}/></div>
          <div>
            <div className="signal-title" style={{ color: "var(--warn)" }}>수급 돌파 기준</div>
            <div className="signal-sub">거래량 급등일(2.5배↑ 양봉) 가격 대비.</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <div className="seg seg-sm">
          {INDICES.map((idx) => (
            <button key={idx} className={`seg-btn${index === idx ? " active" : ""}`} onClick={() => setIndex(idx)}>
              {INDEX_LABELS[idx]}
            </button>
          ))}
        </div>

        <div className="seg seg-sm">
          <span className="seg-btn" style={{ cursor: "default", color: "var(--fg-4)" }}>최소 점수</span>
          {[0, 30, 50, 70].map((s) => (
            <button key={s} className={`seg-btn${minScore === s ? " active" : ""}`} onClick={() => setMinScore(s)}>
              {s === 0 ? "전체" : `${s}+`}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {date && <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>최근 분석: {date}</span>}
          <button className="btn btn-icon" onClick={() => loadCache(index)} disabled={loading || scanning}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button className="btn btn-primary" onClick={() => startScan(false)} disabled={scanning}>
            <Play className="h-3.5 w-3.5" />
            {scanning ? "분석 중..." : "스캔"}
          </button>
          <button className="btn" onClick={() => startScan(true)} disabled={scanning} style={{ fontSize: 11 }}>
            강제 재분석
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
            <span>스캔 중...</span>
            <span>{progress.analyzed} / {progress.total}</span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct}%`, transition: "width 300ms" }} />
          </div>
        </div>
      )}

      {/* Results table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg-4)", fontSize: 13 }}>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg-4)", fontSize: 13 }}>
          {results.length === 0 ? "분석 결과가 없습니다. 스캔 버튼을 눌러 분석을 시작하세요." : "선택한 최소 점수 이상의 종목이 없습니다."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>종목</th>
                <th className="right">가격</th>
                <th className="center" style={{ color: "var(--accent)" }}>52주 저점</th>
                <th className="center" style={{ color: "var(--up)" }}>로컬 미니마</th>
                <th className="center" style={{ color: "var(--warn)" }}>수급 돌파</th>
                <th className="center">수급 강도</th>
                <th className="center">52주 위치</th>
                <th className="center">차트</th>
                <th className="center">점수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.ticker}>
                  <td style={{ color: "var(--fg-4)" }}>{i + 1}</td>
                  <td>
                    <div className="ticker-row">
                      <div>
                        <div className="ticker">{row.ticker}</div>
                        <div className="ticker-name">{row.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="right num" style={{ color: "var(--fg-2)" }}>
                    {row.currency === "KRW" ? `₩${row.price.toLocaleString()}` : `$${row.price.toFixed(row.price < 10 ? 2 : 2)}`}
                  </td>
                  <td className="center">
                    <MultipleBadge value={row.from52wLow} label={row.low52w != null ? `$${row.low52w < 10 ? row.low52w.toFixed(2) : row.low52w.toFixed(0)}` : ""} />
                  </td>
                  <td className="center">
                    <MultipleBadge value={row.fromLocalMin} label={row.localMinDate ? row.localMinDate.slice(5) : ""} />
                  </td>
                  <td className="center">
                    <MultipleBadge value={row.fromVolBase} label={row.volBaseDate ? row.volBaseDate.slice(5) : ""} />
                  </td>
                  <td className="center"><VolumeBadge ratio={row.volumeRatio} /></td>
                  <td className="center"><RangeBar pct={row.recoveryPct} /></td>
                  <td><Sparkline data={row.sparkline} score={row.score} /></td>
                  <td className="center"><ScoreBadge score={row.score} signals={row.signalsCount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
