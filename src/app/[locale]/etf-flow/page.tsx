"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, RefreshCw, Play, Search, Flame, ChevronDown, ChevronRight,
  BarChart2, Zap, AlertTriangle, CheckCircle2, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EtfFlowItem } from "@/app/api/etf-flow/route";
import type { SmartMoneyStock } from "@/app/api/etf-flow/smart-money/route";
import { ETF_CATEGORIES, type EtfCategory } from "@/lib/etf-kr-tickers";

// ── 유틸 컴포넌트 ─────────────────────────────────────────
function Spark({ data, changePct }: { data: number[]; changePct: number }) {
  if (data.length < 2) return <div className="h-8 w-20 rounded bg-muted/20" />;
  const W = 80, H = 32, P = 1;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = P + (1 - (v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = changePct >= 0 ? "#10b981" : "#ef4444";
  const fill = [`${P},${H}`, ...pts, `${(W - P).toFixed(1)},${H}`].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 80, height: 32 }} preserveAspectRatio="none">
      <polygon points={fill} fill={color} fillOpacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Pct({ v, cls = "" }: { v: number | null; cls?: string }) {
  if (v == null) return <span className="text-muted-foreground text-xs">–</span>;
  return <span className={cn("text-xs font-medium tabular-nums", v >= 0 ? "text-emerald-500" : "text-red-500", cls)}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}

function VolBadge({ ratio }: { ratio: number }) {
  if (ratio >= 2.5) return <span className="inline-flex items-center gap-0.5 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-400"><Flame className="h-2.5 w-2.5" />{ratio.toFixed(1)}x</span>;
  if (ratio >= 1.5) return <span className="inline-flex items-center gap-0.5 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400"><Zap className="h-2.5 w-2.5" />{ratio.toFixed(1)}x</span>;
  if (ratio >= 1.2) return <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">{ratio.toFixed(1)}x</span>;
  return <span className="text-[10px] text-muted-foreground">{ratio.toFixed(1)}x</span>;
}

function SignalBadge({ signal, score }: { signal: SmartMoneyStock["signal"]; score: number }) {
  const cfg = {
    "선행매수": { cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Target },
    "추세확인": { cls: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle2 },
    "주의":    { cls: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
    "중립":    { cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: BarChart2 },
  }[signal];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", cfg.cls)}>
      <Icon className="h-3 w-3" />{signal}
      <span className="ml-0.5 opacity-70">{"★".repeat(score)}{"☆".repeat(5 - score)}</span>
    </span>
  );
}

function formatKrw(v: number) {
  if (v >= 1e11) return `${(v / 1e11).toFixed(1)}천억`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return `${v.toFixed(0)}원`;
}

// ── 메인 ─────────────────────────────────────────────────
interface JobState { running: boolean; analyzed: number; total: number }

export default function EtfFlowPage() {
  const [tab, setTab] = useState<"flow" | "smart">("flow");
  const [etfs, setEtfs] = useState<EtfFlowItem[]>([]);
  const [smartStocks, setSmartStocks] = useState<SmartMoneyStock[]>([]);
  const [smartMeta, setSmartMeta] = useState<{ inflowEtfCount: number; date: string } | null>(null);
  const [smartMessage, setSmartMessage] = useState<string | null>(null);
  const [smartDebug, setSmartDebug] = useState<{ totalEtfs: number; etfsWithHoldings: number; etfsHighVolume: number; inflowEtfs: number } | null>(null);
  const [job, setJob] = useState<JobState>({ running: false, analyzed: 0, total: 0 });
  const [smartLoading, setSmartLoading] = useState(false);
  const [loadingCache, setLoadingCache] = useState(false);
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<EtfCategory | "전체">("전체");
  const [sortBy, setSortBy] = useState<"volume" | "change" | "week" | "month">("volume");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [smartSearch, setSmartSearch] = useState("");
  const [signalFilter, setSignalFilter] = useState<SmartMoneyStock["signal"] | "전체">("전체");
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const loadCache = async () => {
    setLoadingCache(true);
    try {
      const res = await fetch("/api/etf-flow");
      const data = await res.json();
      if (data.etfs) { setEtfs(data.etfs); setDate(data.date ?? ""); }
    } finally { setLoadingCache(false); }
  };

  const loadSmartMoney = async () => {
    setSmartLoading(true);
    setSmartMessage(null);
    try {
      const res = await fetch("/api/etf-flow/smart-money");
      const data = await res.json();
      setSmartDebug(data.debug ?? null);
      if (data.stocks) {
        setSmartStocks(data.stocks);
        setSmartMeta(data.stocks.length > 0 ? { inflowEtfCount: data.inflowEtfCount, date: data.date } : null);
      }
      if (data.message) setSmartMessage(data.message);
    } finally { setSmartLoading(false); }
  };

  useEffect(() => { loadCache(); }, []);

  const startAnalysis = (refresh = false) => {
    if (job.running) return;
    esRef.current?.close();
    setJob({ running: true, analyzed: 0, total: 0 });

    const es = new EventSource(`/api/etf-flow/stream${refresh ? "?refresh=1" : ""}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start") {
        setJob({ running: true, analyzed: msg.analyzed, total: msg.total });
        if (msg.analyzed > 0) loadCache();
      }
      if (msg.type === "progress") {
        setJob(p => ({ ...p, analyzed: msg.analyzed }));
        if (msg.item) setEtfs(prev => {
          const idx = prev.findIndex(e => e.ticker === msg.item.ticker);
          return idx >= 0 ? prev.map((e, i) => i === idx ? msg.item : e) : [...prev, msg.item];
        });
      }
      if (msg.type === "done" || msg.type === "error") {
        setJob(p => ({ ...p, running: false }));
        es.close();
        loadCache();
      }
    };
    es.onerror = () => { setJob(p => ({ ...p, running: false })); es.close(); };
  };

  const displayed = useMemo(() => {
    let list = [...etfs];
    if (category !== "전체") list = list.filter(e => e.category === category);
    if (search) { const q = search.toLowerCase(); list = list.filter(e => e.ticker.includes(q) || e.name.toLowerCase().includes(q)); }
    list.sort((a, b) =>
      sortBy === "volume" ? b.volumeRatio - a.volumeRatio
      : sortBy === "change" ? b.changePct - a.changePct
      : sortBy === "week" ? (b.weekChangePct ?? -999) - (a.weekChangePct ?? -999)
      : (b.monthChangePct ?? -999) - (a.monthChangePct ?? -999));
    return list;
  }, [etfs, category, search, sortBy]);

  const displayedStocks = useMemo(() => {
    let list = [...smartStocks];
    if (signalFilter !== "전체") list = list.filter(s => s.signal === signalFilter);
    if (smartSearch) { const q = smartSearch.toLowerCase(); list = list.filter(s => s.ticker.includes(q) || s.name.toLowerCase().includes(q)); }
    return list;
  }, [smartStocks, signalFilter, smartSearch]);

  const progressPct = job.total > 0 ? Math.round((job.analyzed / job.total) * 100) : 0;
  const inflowCount = etfs.filter(e => e.volumeRatio >= 1.2).length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
            <TrendingUp className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ETF 자금 흐름</h1>
            <p className="text-sm text-muted-foreground">ETF 구성종목별 자금 흐름 → 매수 신호 분석</p>
          </div>
        </div>
        {date && <p className="text-xs text-muted-foreground">기준일: {date}</p>}
      </div>

      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <Button onClick={() => startAnalysis(false)} disabled={job.running} className="shrink-0 bg-blue-600 text-white hover:bg-blue-700">
          {job.running ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          {job.running ? `ETF 분석 중...` : "ETF 분석 시작"}
        </Button>
        {etfs.length > 0 && <>
          <Button onClick={() => startAnalysis(true)} disabled={job.running} size="sm" variant="outline">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />새로고침
          </Button>
          <Button onClick={loadSmartMoney} disabled={smartLoading} size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
            {smartLoading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Target className="mr-1.5 h-3.5 w-3.5" />}
            {smartLoading ? "종목 분석 중..." : "스마트머니 분석"}
          </Button>
        </>}
        {job.total > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{job.analyzed}/{job.total}</span>
          </div>
        )}
        {etfs.length > 0 && (
          <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
            <span>ETF <b className="text-foreground">{etfs.length}</b>개</span>
            <span>자금유입 <b className="text-blue-400">{inflowCount}</b>개</span>
            {smartStocks.length > 0 && <span>매수후보 <b className="text-emerald-400">{smartStocks.filter(s => s.signal === "선행매수").length}</b>개</span>}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl bg-muted/30 p-1">
        {[
          { id: "flow",  label: "ETF 흐름", icon: BarChart2 },
          { id: "smart", label: "스마트머니 / 매수 신호", icon: Target },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* 빈 상태 */}
      {!loadingCache && etfs.length === 0 && !job.running && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <TrendingUp className="h-12 w-12 opacity-20" />
          <p className="text-sm font-medium">ETF 분석 시작을 눌러주세요</p>
          <p className="text-xs text-center max-w-sm">
            한국 주요 ETF ~110개의 거래량, 구성종목을 분석하고<br />
            자금이 쏠리는 종목을 자동으로 추출합니다.
          </p>
        </div>
      )}

      {/* ── ETF 흐름 탭 ──────────────────────────────────── */}
      {tab === "flow" && etfs.length > 0 && (
        <div className="space-y-3">
          {/* 필터 */}
          <div className="flex flex-wrap gap-1">
            {(["전체", ...ETF_CATEGORIES] as const).map(c => (
              <button key={c} onClick={() => setCategory(c as typeof category)}
                className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  category === c ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground")}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
              {[["volume","거래량"],["change","일간"],["week","주간"],["month","월간"]].map(([k,l]) => (
                <button key={k} onClick={() => setSortBy(k as typeof sortBy)}
                  className={cn("rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    sortBy === k ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground")}>
                  {l}↓
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-44">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="ETF 검색..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{displayed.length}개</span>
          </div>

          {/* 헤더 행 */}
          <div className="grid items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            style={{ gridTemplateColumns: "1fr 56px 52px 52px 52px 60px 16px" }}>
            <span>ETF</span>
            <span className="text-right">차트</span>
            <span className="text-right">일간</span>
            <span className="text-right">주간</span>
            <span className="text-right">월간</span>
            <span className="text-right">거래량</span>
            <span />
          </div>

          {/* ETF 목록 */}
          <div className="divide-y divide-border/40 rounded-xl border border-border/50 overflow-hidden">
            {displayed.map(etf => (
              <div key={etf.ticker} className={cn("transition-colors",
                etf.volumeRatio >= 2.5 ? "bg-orange-500/5"
                : etf.volumeRatio >= 1.5 ? "bg-yellow-500/5"
                : etf.volumeRatio >= 1.2 ? "bg-blue-500/5"
                : "")}>
                <button
                  className="grid w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/20"
                  style={{ gridTemplateColumns: "1fr 56px 52px 52px 52px 60px 16px" }}
                  onClick={() => setExpanded(expanded === etf.ticker ? null : etf.ticker)}>
                  {/* 종목명 */}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className={cn("h-4 w-0.5 shrink-0 rounded-full",
                      etf.changePct >= 2 ? "bg-emerald-500" : etf.changePct >= 0 ? "bg-emerald-500/50"
                      : etf.changePct >= -2 ? "bg-red-500/50" : "bg-red-500")} />
                    <div className="min-w-0">
                      <span className="truncate text-xs font-medium">{etf.name}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{etf.ticker}</span>
                    </div>
                    {etf.volumeRatio >= 1.2 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">{etf.category}</span>
                    )}
                  </div>
                  {/* 차트 */}
                  <div className="flex justify-end"><Spark data={etf.sparkline} changePct={etf.changePct} /></div>
                  {/* 수익률 */}
                  <div className="text-right"><Pct v={etf.changePct} /></div>
                  <div className="text-right"><Pct v={etf.weekChangePct} /></div>
                  <div className="text-right"><Pct v={etf.monthChangePct} /></div>
                  <div className="text-right"><VolBadge ratio={etf.volumeRatio} /></div>
                  <div>{expanded === etf.ticker ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                </button>
                {expanded === etf.ticker && (
                  <div className="border-t border-border/40 bg-muted/10 px-4 py-3">
                    {etf.holdings.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {etf.holdings.map(h => (
                          <span key={h.ticker} className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-xs">
                            <span className="font-medium">{h.name || h.ticker}</span>
                            <span className="text-[10px] text-muted-foreground">{h.ticker}</span>
                            <span className="font-bold text-blue-400">{h.pct}%</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">구성종목 데이터 없음 (Yahoo Finance 미지원)</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 스마트머니 탭 ────────────────────────────────── */}
      {tab === "smart" && (
        <div className="space-y-4">
          {smartStocks.length === 0 && !smartLoading && (
            <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
              <Target className="h-12 w-12 opacity-20" />
              {smartMessage ? (
                <>
                  <p className="text-sm font-medium text-orange-400 text-center max-w-md">{smartMessage}</p>
                  {smartDebug && (
                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      {[
                        { label: "분석된 ETF", value: smartDebug.totalEtfs },
                        { label: "구성종목 있음", value: smartDebug.etfsWithHoldings, warn: smartDebug.etfsWithHoldings === 0 },
                        { label: "거래량 급증", value: smartDebug.etfsHighVolume },
                        { label: "조건 충족", value: smartDebug.inflowEtfs, warn: smartDebug.inflowEtfs === 0 },
                      ].map(c => (
                        <div key={c.label} className="rounded-xl border border-border bg-muted/20 p-3">
                          <p className="text-[10px] text-muted-foreground">{c.label}</p>
                          <p className={cn("mt-0.5 text-xl font-bold", c.warn ? "text-red-400" : "text-foreground")}>{c.value}개</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">스마트머니 분석을 실행하세요</p>
                  <p className="text-xs text-center max-w-md">
                    ETF 분석 완료 후 <b className="text-foreground">스마트머니 분석</b> 버튼을 누르면<br />
                    자금 유입 ETF의 구성종목 주가를 직접 조회해<br />
                    <b className="text-emerald-400">선행매수</b> · <b className="text-blue-400">추세확인</b> 신호를 분류합니다.
                  </p>
                  {etfs.length === 0 && <p className="text-xs text-orange-400">먼저 ETF 분석을 실행해주세요.</p>}
                </>
              )}
            </div>
          )}

          {smartLoading && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin opacity-40" />
              <p className="text-sm">ETF 구성종목 주가 조회 중...</p>
              <p className="text-xs">자금유입 ETF 구성종목의 실시간 주가를 수집합니다.</p>
            </div>
          )}

          {smartStocks.length > 0 && !smartLoading && (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "자금유입 ETF", value: `${smartMeta?.inflowEtfCount ?? 0}개`, color: "text-blue-400" },
                  { label: "분석 종목", value: `${smartStocks.length}개`, color: "text-foreground" },
                  { label: "선행매수", value: `${smartStocks.filter(s => s.signal === "선행매수").length}개`, color: "text-emerald-400" },
                  { label: "추세확인", value: `${smartStocks.filter(s => s.signal === "추세확인").length}개`, color: "text-blue-400" },
                ].map(c => (
                  <div key={c.label} className="rounded-xl border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={cn("mt-0.5 text-xl font-bold", c.color)}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* 알고리즘 설명 */}
              <div className="rounded-xl border border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                <b className="text-foreground">수요점수</b> = Σ(보유비중 × 거래량비율) |{" "}
                <b className="text-foreground">추정유입액</b> = 평균 초과 거래량 × ETF단가 × 보유비중<br />
                <span className="text-emerald-400 font-semibold">선행매수</span> = ETF 자금유입 강함 + 종목 주가 아직 미반응 →{" "}
                <span className="text-blue-400 font-semibold">추세확인</span> = ETF + 종목 동반 상승 →{" "}
                <span className="text-red-400 font-semibold">주의</span> = 자금 약하거나 하락세
              </div>

              {/* 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
                  {(["전체","선행매수","추세확인","중립","주의"] as const).map(s => (
                    <button key={s} onClick={() => setSignalFilter(s)}
                      className={cn("rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        signalFilter === s ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {s} {s !== "전체" && `(${smartStocks.filter(x => x.signal === s).length})`}
                    </button>
                  ))}
                </div>
                <div className="relative ml-auto w-44">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="종목 검색..." value={smartSearch} onChange={e => setSmartSearch(e.target.value)} className="h-8 pl-8 text-xs" />
                </div>
              </div>

              {/* 종목 목록 */}
              <div className="space-y-2">
                {displayedStocks.map((s, i) => (
                  <div key={s.ticker} className={cn("rounded-xl border transition-colors",
                    s.signal === "선행매수" ? "border-emerald-500/30 bg-emerald-500/5"
                    : s.signal === "추세확인" ? "border-blue-500/20 bg-blue-500/5"
                    : s.signal === "주의" ? "border-red-500/20 bg-red-500/5"
                    : "border-border/50")}>
                    {/* 메인 행 */}
                    <button className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setExpandedStock(expandedStock === s.ticker ? null : s.ticker)}>
                      {/* 순위 */}
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        i < 3 ? "bg-foreground/10 text-foreground" : "text-muted-foreground text-sm")}>
                        {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
                      </div>

                      {/* 종목 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{s.name || s.ticker}</span>
                          <span className="text-xs text-muted-foreground">{s.ticker}</span>
                          <SignalBadge signal={s.signal} score={s.signalScore} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{s.reason}</p>
                      </div>

                      {/* 수치 */}
                      <div className="grid shrink-0 grid-cols-4 gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-muted-foreground">수요점수</p>
                          <p className={cn("text-sm font-bold tabular-nums",
                            s.demandScore >= 10 ? "text-emerald-400" : s.demandScore >= 5 ? "text-blue-400" : "text-foreground")}>
                            {s.demandScore.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">추정유입</p>
                          <p className="text-xs font-semibold text-orange-400">{formatKrw(s.estimatedInflowKrw)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">오늘</p>
                          <Pct v={s.stockChangePct} />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">주간</p>
                          <Pct v={s.stockWeekChangePct} />
                        </div>
                      </div>

                      {expandedStock === s.ticker
                        ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>

                    {/* 상세 패널 */}
                    {expandedStock === s.ticker && (
                      <div className="border-t border-border/50 px-4 py-3 space-y-3">
                        {/* 요약 통계 */}
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 text-center">
                          {[
                            { label: "보유 ETF", value: `${s.etfCount}개` },
                            { label: "평균 비중", value: `${s.avgHoldingPct}%` },
                            { label: "현재가", value: s.stockPrice ? (s.stockCurrency === "USD" ? `$${s.stockPrice.toFixed(2)}` : `₩${s.stockPrice.toLocaleString()}`) : "–" },
                            { label: "오늘 수익률", value: s.stockChangePct != null ? `${s.stockChangePct >= 0 ? "+" : ""}${s.stockChangePct.toFixed(2)}%` : "–" },
                            { label: "주간 수익률", value: s.stockWeekChangePct != null ? `${s.stockWeekChangePct >= 0 ? "+" : ""}${s.stockWeekChangePct.toFixed(2)}%` : "–" },
                          ].map(c => (
                            <div key={c.label} className="rounded-lg bg-muted/30 px-2 py-2">
                              <p className="text-[10px] text-muted-foreground">{c.label}</p>
                              <p className="mt-0.5 text-sm font-semibold">{c.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* 유입 ETF 목록 */}
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">자금 유입 ETF</p>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {s.inflows.map((inf, ii) => (
                              <div key={ii} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                                <span className="truncate text-xs">{inf.etfName}</span>
                                <div className="flex shrink-0 items-center gap-2 ml-2">
                                  <span className="text-xs text-blue-400 font-semibold">{inf.holdingPct}%</span>
                                  <VolBadge ratio={inf.volumeRatio} />
                                  {inf.inflowKrw > 0 && <span className="text-[10px] text-orange-400">{formatKrw(inf.inflowKrw)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {(etfs.length > 0 || smartStocks.length > 0) && (
        <p className="text-xs text-muted-foreground">
          * Yahoo Finance 데이터 기준. 추정 유입금액은 거래량 기반 추산으로 실제 AUM 변화와 다를 수 있습니다. 투자 권유 아님.
        </p>
      )}
    </div>
  );
}
