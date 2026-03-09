"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, RefreshCw, CheckCircle2, XCircle, MinusCircle, Search, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanSlimResult } from "@/app/api/canslim/route";
import { INDEX_LABELS, ALL_TICKERS, type IndexName } from "@/lib/index-tickers";

const LETTERS = ["C", "A", "N", "S", "L", "I", "M"] as const;

const CRITERIA_INFO: Record<string, { short: string; desc: string }> = {
  C: { short: "분기EPS",    desc: "최근 분기 EPS 성장 ≥ 25%" },
  A: { short: "연간EPS",    desc: "연간 EPS / 매출 성장 ≥ 25%" },
  N: { short: "신고가",      desc: "52주 신고가의 75% 이상" },
  S: { short: "거래량",      desc: "거래량 10일 평균 대비 125% 이상" },
  L: { short: "강세주",      desc: "52주 수익률 +10% 이상" },
  I: { short: "기관보유",    desc: "기관 보유 비중 5% 이상" },
  M: { short: "시장추세",    desc: "S&P500 50일선 위 (상승 추세)" },
};

function CriteriaIcon({ val }: { val: boolean | null }) {
  if (val === true)  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (val === false) return <XCircle className="h-3.5 w-3.5 text-red-500/50" />;
  return <MinusCircle className="h-3.5 w-3.5 text-zinc-600" />;
}

function MiniChart({ data, score }: { data: number[]; score: number }) {
  if (data.length < 2) return <div className="h-10 w-full rounded bg-muted/20" />;

  const W = 200;
  const H = 48;
  const PAD = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = data[data.length - 1] >= data[0];
  const color = score >= 5 ? (isUp ? "#10b981" : "#ef4444")
    : score >= 3 ? (isUp ? "#3b82f6" : "#f97316")
    : "#71717a";

  const fillPts = [
    `${PAD},${H}`,
    ...pts,
    `${(W - PAD).toFixed(1)},${H}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 44 }}
      preserveAspectRatio="none"
    >
      <polygon points={fillPts} fill={color} fillOpacity={0.1} />
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

function ScoreBar({ score, max = 7 }: { score: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i < score
              ? score >= 6 ? "bg-emerald-500"
              : score >= 4 ? "bg-blue-500"
              : "bg-zinc-500"
              : "bg-zinc-800"
          )}
        />
      ))}
    </div>
  );
}

interface JobState {
  running: boolean;
  analyzed: number;
  total: number;
}

export default function CanSlimPage() {
  const [activeIndex, setActiveIndex] = useState<IndexName>("KOSPI");
  const [results, setResults] = useState<Record<IndexName, CanSlimResult[]>>({
    KOSPI: [], NASDAQ100: [], SP100: [],
  });
  const [loadingCache, setLoadingCache] = useState(false);
  const [job, setJob] = useState<Record<IndexName, JobState>>({
    KOSPI:    { running: false, analyzed: 0, total: 0 },
    NASDAQ100: { running: false, analyzed: 0, total: 0 },
    SP100:    { running: false, analyzed: 0, total: 0 },
  });
  const [date, setDate] = useState("");
  const [scoreFilter, setScoreFilter] = useState<number>(3);
  const [search, setSearch] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const loadCached = async (index: IndexName) => {
    setLoadingCache(true);
    try {
      const res = await fetch(`/api/canslim?index=${index}`);
      const data = await res.json();
      if (data.results) {
        setResults((prev) => ({ ...prev, [index]: data.results }));
        setDate(data.date ?? "");
      }
    } finally {
      setLoadingCache(false);
    }
  };

  useEffect(() => {
    loadCached(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const startAnalysis = (index: IndexName) => {
    if (job[index].running) return;
    esRef.current?.close();

    const total = ALL_TICKERS[index].length;
    setJob((prev) => ({ ...prev, [index]: { running: true, analyzed: 0, total } }));

    const es = new EventSource(`/api/canslim/stream?index=${index}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "start") {
        setJob((prev) => ({ ...prev, [index]: { running: true, analyzed: msg.analyzed, total: msg.total } }));
        // 이미 캐시된 결과 즉시 로드
        if (msg.analyzed > 0) loadCached(index);
      }

      if (msg.type === "progress") {
        setJob((prev) => ({ ...prev, [index]: { ...prev[index], analyzed: msg.analyzed } }));
        if (msg.result) {
          setResults((prev) => {
            const existing = prev[index];
            const idx = existing.findIndex((r) => r.ticker === msg.result.ticker);
            const next = idx >= 0
              ? existing.map((r, i) => (i === idx ? msg.result : r))
              : [...existing, msg.result];
            return { ...prev, [index]: next.sort((a, b) => b.score - a.score) };
          });
        }
      }

      if (msg.type === "done" || msg.type === "error") {
        setJob((prev) => ({ ...prev, [index]: { running: false, analyzed: msg.analyzed ?? prev[index].analyzed, total: msg.total ?? prev[index].total } }));
        es.close();
        loadCached(index);
      }
    };

    es.onerror = () => {
      setJob((prev) => ({ ...prev, [index]: { ...prev[index], running: false } }));
      es.close();
    };
  };

  const currentJob = job[activeIndex];
  const allResults = results[activeIndex];

  const displayed = allResults.filter((r) => {
    if (r.score < scoreFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    }
    return true;
  });

  const progressPct = currentJob.total > 0
    ? Math.round((currentJob.analyzed / currentJob.total) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
            <Filter className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">CAN SLIM 스크리닝</h1>
            <p className="text-sm text-muted-foreground">
              KOSPI 주요 종목 / NASDAQ 100 / S&P 100 — William O'Neil 기준 분석
            </p>
          </div>
        </div>
      </div>

      {/* 인덱스 탭 */}
      <div className="flex gap-1 rounded-xl bg-muted/30 p-1">
        {(Object.keys(INDEX_LABELS) as IndexName[]).map((idx) => {
          const count = results[idx].filter((r) => r.score >= scoreFilter).length;
          return (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                activeIndex === idx
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {INDEX_LABELS[idx]}
              {count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  activeIndex === idx ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 분석 컨트롤 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <Button
          onClick={() => startAnalysis(activeIndex)}
          disabled={currentJob.running}
          size="default"
          className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {currentJob.running
            ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            : <Play className="mr-2 h-4 w-4" />
          }
          {currentJob.running ? "분석 중..." : "분석 시작"}
        </Button>

        {/* 진행률 바 */}
        {currentJob.total > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {currentJob.analyzed} / {currentJob.total}
            </span>
          </div>
        )}

        {date && !currentJob.running && (
          <span className="ml-auto text-xs text-muted-foreground">기준일: {date}</span>
        )}
      </div>

      {/* CAN SLIM 기준 요약 */}
      <div className="grid grid-cols-7 gap-1">
        {LETTERS.map((l) => (
          <div key={l} title={CRITERIA_INFO[l].desc} className="rounded-lg bg-muted/30 px-2 py-1.5 text-center cursor-help">
            <p className="text-base font-bold">{l}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{CRITERIA_INFO[l].short}</p>
          </div>
        ))}
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
          {[3, 4, 5, 6].map((s) => (
            <button
              key={s}
              onClick={() => setScoreFilter(s)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                scoreFilter === s
                  ? s >= 5 ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-blue-500/20 text-blue-400"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s}점 이상
            </button>
          ))}
          <button
            onClick={() => setScoreFilter(0)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              scoreFilter === 0 ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            전체
          </button>
        </div>

        <div className="relative ml-auto w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="종목 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <span className="text-xs text-muted-foreground">
          {displayed.length}개 / {allResults.length}개
        </span>
      </div>

      {/* 로딩 */}
      {loadingCache && allResults.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">캐시 불러오는 중...</span>
        </div>
      )}

      {/* 비어있음 */}
      {!loadingCache && !currentJob.running && allResults.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Filter className="h-12 w-12 opacity-20" />
          <p className="text-sm">분석 시작 버튼을 눌러 {INDEX_LABELS[activeIndex]} 종목을 분석하세요.</p>
          <p className="text-xs">총 {ALL_TICKERS[activeIndex].length}개 종목 · 첫 분석 후 당일 결과가 캐싱됩니다.</p>
        </div>
      )}

      {/* 결과 카드 그리드 */}
      {displayed.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((item) => (
            <Card
              key={item.ticker}
              className={cn(
                "transition-colors",
                item.score >= 6 ? "border-emerald-500/30"
                : item.score >= 4 ? "border-blue-500/20"
                : ""
              )}
            >
              <CardContent className="p-4">
                {/* 종목 정보 */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{item.ticker}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-bold",
                        item.score >= 6 ? "border-emerald-500/40 text-emerald-400"
                        : item.score >= 4 ? "border-blue-500/40 text-blue-400"
                        : "text-muted-foreground"
                      )}
                    >
                      {item.score}/7
                    </Badge>
                    {item.change52wPct !== null && (
                      <p className={cn(
                        "mt-0.5 text-xs font-medium",
                        item.change52wPct >= 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        52w {item.change52wPct >= 0 ? "+" : ""}{item.change52wPct}%
                      </p>
                    )}
                  </div>
                </div>

                {/* 미니 차트 */}
                <div className="mb-2 overflow-hidden rounded-md bg-muted/10">
                  <MiniChart data={item.sparkline ?? []} score={item.score} />
                </div>

                {/* 현재가 + 점수 바 */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.currency === "USD"
                      ? `$${item.price.toFixed(2)}`
                      : `₩${item.price.toLocaleString()}`}
                  </span>
                  <div className="w-24 shrink-0">
                    <ScoreBar score={item.score} />
                  </div>
                </div>

                {/* 기준별 상태 */}
                <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                  {LETTERS.map((l) => (
                    <div key={l} className="flex items-center gap-1">
                      <CriteriaIcon val={item.criteria[l]} />
                      <span className="text-xs">
                        <span className="font-semibold">{l}</span>
                        <span className="ml-1 text-muted-foreground">{CRITERIA_INFO[l].short}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 결과 있지만 필터로 비어있을 때 */}
      {!loadingCache && allResults.length > 0 && displayed.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <p className="text-sm">조건에 맞는 종목이 없습니다.</p>
          <button onClick={() => setScoreFilter(0)} className="text-xs text-blue-400 underline">
            전체 보기
          </button>
        </div>
      )}

      {allResults.length > 0 && (
        <p className="text-xs text-muted-foreground">
          * Yahoo Finance 데이터 기준, 투자 권유 아님.
          회색(–)은 데이터 없음으로 점수 미반영.
        </p>
      )}
    </div>
  );
}
