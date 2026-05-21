"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, RefreshCw, Briefcase, Eye, TrendingUp, TrendingDown, Sparkles, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIDisclaimer } from "@/components/layout/Disclaimer";
import type { EarningsCalendarItem } from "@/app/api/earnings-calendar/route";
import type { EarningsResultRow } from "@/app/api/earnings-results/route";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isKorean = (t: string) => /^\d[A-Z0-9]{5}$/i.test(t);

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
function fmtEps(v: number, ticker: string) {
  return isKorean(ticker) ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;
}
function fmtRevenue(v: number, ticker: string) {
  if (isKorean(ticker)) {
    // DART fnlttSinglAcntAll 단위: 원(₩)
    const sign = v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const jo = abs / 1_000_000_000_000;
    if (jo >= 1) return `${sign}₩${jo.toFixed(1)}조`;
    const eok = abs / 100_000_000;
    if (eok >= 1)  return `${sign}₩${Math.round(eok).toLocaleString()}억`;
    const man = abs / 10_000;
    if (man >= 1)  return `${sign}₩${Math.round(man).toLocaleString()}만`;
    return `${sign}₩${Math.round(abs).toLocaleString()}`;
  }
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}
function fmtChange(curr: number, prev: number | null) {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: string }) {
  if (source === "holding")
    return <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300"><Briefcase className="h-2.5 w-2.5" />보유</span>;
  if (source === "watchlist")
    return <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300"><Eye className="h-2.5 w-2.5" />관심</span>;
  return <span className="inline-flex items-center gap-1 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">보유·관심</span>;
}

function DDayBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">미정</span>;
  if (days < 0) return <span className="rounded bg-zinc-500/20 px-2 py-0.5 text-[11px] text-zinc-500">D+{Math.abs(days)}</span>;
  if (days === 0) return <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-300">D-DAY</span>;
  const color = days <= 3 ? "bg-red-500/20 text-red-700 dark:text-red-300"
    : days <= 7  ? "bg-orange-500/20 text-orange-700 dark:text-orange-300"
    : days <= 30 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "bg-muted text-muted-foreground";
  return <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", color)}>D-{days}</span>;
}

function ChangePct({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground/50">—</span>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium",
      up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) elements.push(<h3 key={i} className="mt-4 mb-1 text-base font-semibold">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="mt-5 mb-2 text-lg font-bold">{line.slice(3)}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={i} className="mt-5 mb-2 text-xl font-bold">{line.slice(2)}</h1>);
    else if (line.startsWith("- ") || line.startsWith("* ")) elements.push(
      <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1")}</li>
    );
    else if (line.match(/^\d+\. /)) elements.push(
      <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{line.replace(/^\d+\. /, "").replace(/\*\*(.*?)\*\*/g, "$1")}</li>
    );
    else if (line.startsWith("**") && line.endsWith("**")) elements.push(<p key={i} className="mt-2 text-sm font-semibold">{line.slice(2, -2)}</p>);
    else if (line === "---" || line === "***") elements.push(<hr key={i} className="my-3 border-muted" />);
    else if (line.trim()) elements.push(
      <p key={i} className="text-sm leading-relaxed text-foreground/90">{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>
    );
    else elements.push(<div key={i} className="h-2" />);
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── 일정 탭 ──────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / MS_PER_DAY);
}
function groupKey(days: number | null) {
  if (days === null) return "미정";
  if (days < 0) return "지남";
  if (days === 0) return "오늘";
  if (days <= 7) return "이번주";
  if (days <= 14) return "다음주";
  if (days <= 30) return "이달 내";
  if (days <= 60) return "다음달";
  return "그 이후";
}
const GROUP_ORDER = ["오늘", "이번주", "다음주", "이달 내", "다음달", "그 이후", "미정", "지남"];

function CalendarTab() {
  const [items, setItems] = useState<EarningsCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await (await fetch("/api/earnings-calendar")).json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true); setRefreshMsg("");
    try {
      const data: { updated: number; failed: string[]; total: number } =
        await (await fetch("/api/earnings-calendar", { method: "POST" })).json();
      setRefreshMsg(`${data.total}개 중 ${data.updated}개 업데이트${data.failed.length ? ` · 실패: ${data.failed.join(", ")}` : ""}`);
      await load();
    } catch { setRefreshMsg("갱신 실패"); }
    finally { setRefreshing(false); }
  };

  const grouped = useMemo(() => {
    const g: Record<string, EarningsCalendarItem[]> = {};
    for (const item of items) { const k = groupKey(daysUntil(item.earnings_date)); (g[k] ??= []).push(item); }
    return g;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          {items.length > 0 ? `${items.length}개 종목 · 일정 확인 ${items.filter(i => i.earnings_date).length}개` : "보유·관심 종목의 실적발표 일정"}
        </p>
        <button onClick={handleRefresh} disabled={refreshing}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-xs disabled:opacity-50 hover:bg-muted/40">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "조회 중..." : "일정 갱신"}
        </button>
      </div>
      {refreshMsg && <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{refreshMsg}</div>}
      {loading && items.length === 0 ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 opacity-20" />
          <p className="text-sm">보유 또는 관심 종목이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.filter(k => grouped[k]?.length).map(key => (
            <div key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {key} <span className="opacity-50">({grouped[key].length})</span>
              </h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {grouped[key].map((item) => {
                  const days = daysUntil(item.earnings_date);
                  const korean = isKorean(item.ticker);
                  return (
                    <div key={item.ticker} className="flex items-center gap-3 px-4 py-3">
                      <DDayBadge days={days} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{item.ticker}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                          <SourceBadge source={item.source} />
                          {korean && <span className="text-[10px] text-muted-foreground/60 bg-muted px-1 rounded">추정일</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                          {item.earnings_date && <span>📅 {item.earnings_date}</span>}
                          {item.eps_estimate !== null && (
                            <span>EPS 추정 {fmtEps(item.eps_estimate, item.ticker)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 결과 탭 ──────────────────────────────────────────────────────────────────
function ResultsTab() {
  const [rows, setRows] = useState<EarningsResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  const load = useCallback(async (autoRefreshIfEmpty = false) => {
    setLoading(true);
    try {
      const data: EarningsResultRow[] = await (await fetch("/api/earnings-results")).json();
      const hasAnyQuarter = Array.isArray(data) && data.some(r => r.quarter != null);
      if (!hasAnyQuarter && autoRefreshIfEmpty) {
        // 첫 진입 시 DB가 비어있으면 자동 갱신
        setLoading(false);
        setRefreshing(true);
        const res: { updated: number; failed: string[]; total: number; totalQuarters?: number; sources?: Record<string, number> } =
          await (await fetch("/api/earnings-results", { method: "POST" })).json();
        const q = res.totalQuarters ? ` · ${res.totalQuarters}개 데이터` : "";
        const src = res.sources ? ` (${Object.entries(res.sources).filter(([,v]) => v > 0).map(([k,v]) => `${k} ${v}`).join(" / ")})` : "";
        setRefreshMsg(`${res.total}개 중 ${res.updated}개 종목${q}${src}${res.failed.length ? ` · 실패: ${res.failed.join(", ")}` : ""}`);
        const fresh: EarningsResultRow[] = await (await fetch("/api/earnings-results")).json();
        setRows(Array.isArray(fresh) ? fresh : []);
        setRefreshing(false);
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(true); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true); setRefreshMsg("");
    try {
      const data: { updated: number; failed: string[]; total: number; totalQuarters?: number; sources?: Record<string, number> } =
        await (await fetch("/api/earnings-results", { method: "POST" })).json();
      const q = data.totalQuarters ? ` · ${data.totalQuarters}개 데이터` : "";
      const src = data.sources
        ? ` (${Object.entries(data.sources).filter(([,v]) => v > 0).map(([k,v]) => `${k} ${v}`).join(" / ")})`
        : "";
      setRefreshMsg(`${data.total}개 중 ${data.updated}개 종목${q}${src}${data.failed.length ? ` · 실패: ${data.failed.join(", ")}` : ""}`);
      await load(false);
    } catch { setRefreshMsg("갱신 실패"); }
    finally { setRefreshing(false); }
  };

  const byTicker = useMemo(() => {
    const m = new Map<string, { name: string; quarters: EarningsResultRow[] }>();
    for (const r of rows) {
      if (!m.has(r.ticker)) m.set(r.ticker, { name: r.name, quarters: [] });
      if (r.quarter) m.get(r.ticker)!.quarters.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">분기/연간 매출·순이익·EPS · 비트/미스 현황</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-xs disabled:opacity-50 hover:bg-muted/40">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "갱신 중..." : "결과 갱신"}
        </button>
      </div>
      {refreshMsg && <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{refreshMsg}</div>}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-36 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : byTicker.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">"결과 갱신"을 눌러 실적 데이터를 불러오세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {byTicker.map(([ticker, { name, quarters }]) => {
            const korean = isKorean(ticker);
            const qs = quarters.slice(0, 4);
            return (
              <div key={ticker} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{ticker}</span>
                    <span className="truncate text-xs text-muted-foreground max-w-[140px]">{name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60">
                    {korean ? "연간 (DART)" : "분기 (Yahoo/Finnhub)"}
                  </span>
                </div>

                {quarters.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">데이터 없음 — 갱신을 눌러주세요</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th className="px-4 py-1.5 text-left font-medium">{korean ? "연도" : "분기"}</th>
                          <th className="px-2 py-1.5 text-right font-medium">매출</th>
                          <th className="px-2 py-1.5 text-right font-medium">순이익</th>
                          <th className="px-2 py-1.5 text-right font-medium">EPS</th>
                          <th className="px-4 py-1.5 text-right font-medium">서프라이즈</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qs.map((q, idx) => {
                          const surprise = q.surprise_pct != null ? Number(q.surprise_pct) : null;
                          const beat = surprise != null && surprise > 0;
                          const miss = surprise != null && surprise < 0;
                          const prevQ = qs[idx + 1] ?? null;
                          const revChange  = q.revenue   != null ? fmtChange(q.revenue,   prevQ?.revenue   ?? null) : null;
                          const niChange   = q.net_income != null ? fmtChange(q.net_income, prevQ?.net_income ?? null) : null;
                          return (
                            <tr key={q.quarter} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-2 font-medium text-foreground/80">{q.quarter}</td>

                              {/* 매출 */}
                              <td className="px-2 py-2 text-right">
                                {q.revenue != null ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-mono">{fmtRevenue(q.revenue, ticker)}</span>
                                    <ChangePct pct={revChange} />
                                  </div>
                                ) : <span className="text-muted-foreground/50">—</span>}
                              </td>

                              {/* 순이익 */}
                              <td className="px-2 py-2 text-right">
                                {q.net_income != null ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-mono">{fmtRevenue(q.net_income, ticker)}</span>
                                    <ChangePct pct={niChange} />
                                  </div>
                                ) : <span className="text-muted-foreground/50">—</span>}
                              </td>

                              {/* EPS */}
                              <td className="px-2 py-2 text-right font-mono">
                                {q.eps_actual != null ? fmtEps(Number(q.eps_actual), ticker) : <span className="text-muted-foreground/50">—</span>}
                                {q.eps_estimate != null && (
                                  <div className="text-[10px] text-muted-foreground">추정 {fmtEps(Number(q.eps_estimate), ticker)}</div>
                                )}
                              </td>

                              {/* 서프라이즈 */}
                              <td className={cn("px-4 py-2 text-right font-mono font-semibold",
                                beat && "text-emerald-600 dark:text-emerald-400",
                                miss && "text-red-600 dark:text-red-400"
                              )}>
                                {surprise != null ? (
                                  <span className="inline-flex items-center gap-0.5 justify-end">
                                    {beat && <TrendingUp className="h-3 w-3" />}
                                    {miss && <TrendingDown className="h-3 w-3" />}
                                    {surprise > 0 ? "+" : ""}{surprise.toFixed(1)}%
                                  </span>
                                ) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI 인사이트 탭 ───────────────────────────────────────────────────────────
function InsightsTab() {
  const [content, setContent] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await (await fetch("/api/earnings-insights")).json();
      setContent(data.content); setGeneratedAt(data.generated_at); setStale(data.stale);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true); setError(null);
    try {
      const res = await fetch("/api/earnings-insights", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "생성 실패"); }
      else { setContent(data.content); setGeneratedAt(data.generated_at); setStale(false); }
    } catch { setError("생성 실패 — 네트워크 오류"); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          {generatedAt
            ? <span>생성: {new Date(generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}{stale && <span className="ml-2 text-amber-600 dark:text-amber-400">· 갱신 권장</span>}</span>
            : "GPT 기반 보유·관심 종목 실적 패턴 분석"}
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-xs disabled:opacity-50 hover:bg-muted/40">
          <Sparkles className={cn("h-3.5 w-3.5", generating && "animate-pulse")} />
          {generating ? "분석 중..." : content ? "다시 생성" : "AI 분석 생성"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : !content ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">"AI 분석 생성"을 누르면<br />보유·관심 종목 실적 패턴을 한 번에 정리합니다.</p>
          <p className="mt-2 text-[11px] text-muted-foreground/70">먼저 [일정]·[결과] 탭에서 갱신하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-5"><MarkdownRenderer text={content} /></div>
          <AIDisclaimer />
        </div>
      )}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
export default function EarningsPage() {
  const [activeTab, setActiveTab] = useState<"calendar" | "results" | "insights">("calendar");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>실적</h1>
        </div>
      </div>
      <div className="tabs">
        <button className={cn("tab", activeTab === "calendar" && "active")} onClick={() => setActiveTab("calendar")}>일정</button>
        <button className={cn("tab", activeTab === "results" && "active")} onClick={() => setActiveTab("results")}>결과</button>
        <button className={cn("tab", activeTab === "insights" && "active")} onClick={() => setActiveTab("insights")}>AI 인사이트</button>
      </div>
      {activeTab === "calendar" && <CalendarTab />}
      {activeTab === "results" && <ResultsTab />}
      {activeTab === "insights" && <InsightsTab />}
    </div>
  );
}
