"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { FileText, ExternalLink, Search, ChevronLeft, ChevronRight, Building2, Tag, RefreshCw, CheckCheck, Briefcase, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHoldings } from "@/hooks/use-api";
import type { AnalystReport, AnalystReportsResponse } from "@/app/api/analyst-reports/route";

const CATEGORY_MAP: Record<string, string> = {
  "Each Company":       "개별 종목",
  "Market Status":      "시황",
  "Investing Analysis": "투자 전략",
  "Industry Analysis":  "산업 분석",
  "Security Analysis":  "증권 분석",
  "Economy Analysis":   "경제 분석",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REC_COLOR: Record<string, string> = {
  "매수":   "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  "BUY":    "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  "중립":   "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  "HOLD":   "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  "매도":   "bg-red-500/20 text-red-700 dark:text-red-400",
  "SELL":   "bg-red-500/20 text-red-700 dark:text-red-400",
};

const LS_KEY = "analyst_reports_read";

function loadReadIds(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch { return new Set(); }
}

function saveReadIds(ids: Set<number>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
}

function RecBadge({ rec }: { rec: string | null }) {
  if (!rec) return null;
  const color = REC_COLOR[rec] ?? "bg-blue-500/20 text-blue-400";
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", color)}>{rec}</span>;
}

function CategoryBadge({ cat }: { cat: string | null }) {
  if (!cat) return null;
  const label = CATEGORY_MAP[cat] ?? cat;
  return (
    <span className="rounded bg-zinc-200 dark:bg-zinc-700/50 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">{label}</span>
  );
}

// ─── ReportCard ───────────────────────────────────────────────────────────────

interface ReportCardProps {
  report: AnalystReport;
  isRead: boolean;
  isOwned: boolean;
  isWatchlisted: boolean;
  onToggleRead: () => void;
}

function ReportCard({ report, isRead, isOwned, isWatchlisted, onToggleRead }: ReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = report.summary_text?.trim() ?? "";
  const lines = summary.split("\n").filter(Boolean);
  const preview = lines.slice(0, 3).join("\n");
  const hasMore = lines.length > 3;

  const borderClass =
    isOwned       ? "border-l-4 border-l-emerald-500 border-t border-r border-b border-border bg-emerald-500/5"
    : isWatchlisted ? "border-l-4 border-l-blue-500 border-t border-r border-b border-border bg-blue-500/5"
    : "border border-border";

  return (
    <div className={cn(
      "rounded-xl p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors",
      borderClass,
      isRead && "opacity-60",
    )}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {/* 보유/관심 뱃지 */}
            {isOwned && (
              <span className="flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Briefcase className="h-2.5 w-2.5" /> 보유
              </span>
            )}
            {!isOwned && isWatchlisted && (
              <span className="flex items-center gap-0.5 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                <Eye className="h-2.5 w-2.5" /> 관심
              </span>
            )}
            {report.firm && (
              <span className="flex items-center gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">
                <Building2 className="h-3 w-3" />{report.firm}
              </span>
            )}
            <CategoryBadge cat={report.category} />
            <RecBadge rec={report.recommendation} />
            {report.target_price && (
              <span className="text-[10px] text-zinc-500">목표가 {report.target_price}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {report.stock_name && report.ticker ? (
              <Link href={`/analyst-reports/${report.ticker}`}
                className="mr-1.5 text-blue-600 dark:text-blue-400 hover:underline">
                [{report.stock_name}]
              </Link>
            ) : report.stock_name ? (
              <span className="mr-1.5 text-blue-600 dark:text-blue-400">[{report.stock_name}]</span>
            ) : null}
            {report.title}
          </h3>
          {report.analyst && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">by {report.analyst}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-[11px] text-zinc-500">{report.date}</p>
          <div className="flex items-center gap-2">
            {report.pdf_url && (
              <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">
                <ExternalLink className="h-3 w-3" /> PDF
              </a>
            )}
            {/* 읽음 토글 */}
            <button
              onClick={onToggleRead}
              title={isRead ? "안읽음으로 표시" : "읽음으로 표시"}
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                isRead
                  ? "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <CheckCheck className="h-3 w-3" />
              {isRead ? "읽음" : "미읽"}
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="mt-2 rounded-lg bg-zinc-100 dark:bg-muted/40 px-3 py-2 text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
          {expanded ? summary : preview}
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)}
              className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-500">
              {expanded ? "접기" : "더보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CATEGORIES = Object.entries(CATEGORY_MAP);
const PAGE_SIZE = 20;

export default function AnalystReportsPage() {
  const [data, setData]         = useState<AnalystReportsResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [category, setCategory] = useState("");
  const [search, setSearch]     = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [readIds, setReadIds]   = useState<Set<number>>(new Set());
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const { data: holdings } = useHoldings();

  // 보유 종목 티커 Set + 이름 Set (ticker null인 리포트 fallback용)
  const ownedTickers = useMemo<Set<string>>(() => {
    if (!Array.isArray(holdings)) return new Set();
    return new Set(
      (holdings as { ticker: string }[])
        .map((h) => h.ticker.toUpperCase())
        .filter((t) => t !== "CASH")
    );
  }, [holdings]);

  const ownedNames = useMemo<Set<string>>(() => {
    if (!Array.isArray(holdings)) return new Set();
    return new Set(
      (holdings as { ticker: string; name: string }[])
        .filter((h) => h.ticker !== "CASH" && h.name)
        .map((h) => h.name.trim())
    );
  }, [holdings]);

  // localStorage에서 읽음 목록 로드
  useEffect(() => {
    setReadIds(loadReadIds());
  }, []);

  const [watchlistNames, setWatchlistNames] = useState<Set<string>>(new Set());

  // 워치리스트 fetch
  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((items) => {
        if (!Array.isArray(items)) return;
        setWatchlistTickers(new Set((items as { ticker: string }[]).map((i) => i.ticker.toUpperCase())));
        setWatchlistNames(new Set((items as { ticker: string; name: string }[]).filter((i) => i.name).map((i) => i.name.trim())));
      })
      .catch(() => {});
  }, []);

  const toggleRead = useCallback((id: number) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const load = useCallback(async (p: number, cat: string, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (cat) params.set("category", cat);
      if (q)   params.set("search", q);
      const res = await fetch(`/api/analyst-reports?${params}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, category, search); }, [page, category, search, load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleCategory = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const filteredReports = useMemo(() => {
    if (!data?.reports) return [];
    if (!showUnreadOnly) return data.reports;
    return data.reports.filter((r) => !readIds.has(r.id));
  }, [data?.reports, showUnreadOnly, readIds]);

  const unreadCount = useMemo(() => {
    if (!data?.reports) return 0;
    return data.reports.filter((r) => !readIds.has(r.id)).length;
  }, [data?.reports, readIds]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
          <FileText className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">증권사 리포트</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `총 ${data.total.toLocaleString()}건` : "로딩 중..."}
            {data && unreadCount > 0 && (
              <span className="ml-2 text-indigo-400">· 미읽 {unreadCount}건</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="종목명 · 제목 · 증권사 검색"
              className="h-8 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-52"
            />
          </div>
          <button type="submit"
            className="h-8 rounded-lg border border-border bg-muted/30 px-3 text-xs hover:bg-muted/60">
            검색
          </button>
          {search && (
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-300">✕</button>
          )}
        </form>

        {/* 미읽음만 보기 */}
        <button
          onClick={() => setShowUnreadOnly((v) => !v)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            showUnreadOnly
              ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-400"
              : "border-border bg-muted/30 text-zinc-500 hover:text-zinc-300"
          )}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          미읽음만
        </button>

        {/* 범례 */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-1 rounded-sm bg-emerald-500" />보유 종목
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-1 rounded-sm bg-blue-500" />관심 종목
          </span>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1">
          <button onClick={() => handleCategory("")}
            className={cn("rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              !category ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-500 hover:text-zinc-300")}>
            전체
          </button>
          {CATEGORIES.map(([en, ko]) => (
            <button key={en} onClick={() => handleCategory(en)}
              className={cn("flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                category === en ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-500 hover:text-zinc-300")}>
              <Tag className="h-3 w-3" />{ko}
            </button>
          ))}
        </div>

        {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {/* Report list */}
      {loading && !data ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
          <FileText className="h-10 w-10 opacity-20" />
          <p className="text-sm">{showUnreadOnly ? "미읽음 리포트가 없습니다" : "검색 결과가 없습니다"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map(r => {
            const tickerUp = r.ticker?.toUpperCase() ?? "";
            const stockName = r.stock_name?.trim() ?? "";
            const isOwned =
              (!!tickerUp && ownedTickers.has(tickerUp)) ||
              (!!stockName && ownedNames.has(stockName));
            const isWatchlisted =
              !isOwned && (
                (!!tickerUp && watchlistTickers.has(tickerUp)) ||
                (!!stockName && watchlistNames.has(stockName))
              );
            return (
            <ReportCard
              key={r.id}
              report={r}
              isRead={readIds.has(r.id)}
              isOwned={isOwned}
              isWatchlisted={isWatchlisted}
              onToggleRead={() => toggleRead(r.id)}
            />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-30 hover:bg-muted/40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-zinc-500">
            {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-30 hover:bg-muted/40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
