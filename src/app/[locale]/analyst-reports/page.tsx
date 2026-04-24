"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, ExternalLink, Search, ChevronLeft, ChevronRight, Building2, Tag, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
  "매수":   "bg-emerald-500/20 text-emerald-400",
  "BUY":    "bg-emerald-500/20 text-emerald-400",
  "중립":   "bg-zinc-500/20 text-zinc-400",
  "HOLD":   "bg-zinc-500/20 text-zinc-400",
  "매도":   "bg-red-500/20 text-red-400",
  "SELL":   "bg-red-500/20 text-red-400",
};

function RecBadge({ rec }: { rec: string | null }) {
  if (!rec) return null;
  const color = REC_COLOR[rec] ?? "bg-blue-500/20 text-blue-400";
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", color)}>{rec}</span>;
}

function CategoryBadge({ cat }: { cat: string | null }) {
  if (!cat) return null;
  const label = CATEGORY_MAP[cat] ?? cat;
  return (
    <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] text-zinc-400">{label}</span>
  );
}

function ReportCard({ report }: { report: AnalystReport }) {
  const [expanded, setExpanded] = useState(false);
  const summary = report.summary_text?.trim() ?? "";
  const lines = summary.split("\n").filter(Boolean);
  const preview = lines.slice(0, 3).join("\n");
  const hasMore = lines.length > 3;

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-zinc-600 transition-colors">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {report.firm && (
              <span className="flex items-center gap-0.5 text-[11px] text-zinc-500">
                <Building2 className="h-3 w-3" />{report.firm}
              </span>
            )}
            <CategoryBadge cat={report.category} />
            <RecBadge rec={report.recommendation} />
            {report.target_price && (
              <span className="text-[10px] text-zinc-500">목표가 {report.target_price}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold leading-snug">
            {report.stock_name && (
              <span className="mr-1.5 text-blue-400">[{report.stock_name}]</span>
            )}
            {report.title}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-zinc-500">{report.date}</p>
          {report.pdf_url && (
            <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-blue-400 hover:text-blue-300">
              <ExternalLink className="h-3 w-3" /> PDF
            </a>
          )}
        </div>
      </div>

      {summary && (
        <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-zinc-300 leading-relaxed whitespace-pre-line">
          {expanded ? summary : preview}
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)}
              className="ml-2 text-blue-400 hover:text-blue-300">
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
      ) : data?.reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
          <FileText className="h-10 w-10 opacity-20" />
          <p className="text-sm">검색 결과가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.reports.map(r => <ReportCard key={r.id} report={r} />)}
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
