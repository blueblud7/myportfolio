"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import {
  SlidersHorizontal, RefreshCw, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, ChevronsUpDown, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureTabs, SCREENER_TABS } from "@/components/layout/FeatureTabs";
import type { ScreenerStock } from "@/app/api/screener/route";

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── 프리셋 필터 ──────────────────────────────────────────────────────────────
const PRESETS: { id: string; label: string; icon: string; filters: Partial<Filters> }[] = [
  { id: "low-per",  label: "저PER",  icon: "💰", filters: { perMax: "10", onlyPositivePer: true } },
  { id: "low-pbr",  label: "저PBR",  icon: "📉", filters: { pbrMax: "1", onlyPositivePbr: true } },
  { id: "high-div", label: "고배당",  icon: "💵", filters: { divYieldMin: "3", onlyPositivePer: false } },
  { id: "gainer",   label: "급등",    icon: "🚀", filters: { changePctMin: "5", onlyPositivePer: false } },
  { id: "loser",    label: "급락",    icon: "📉", filters: { changePctMax: "-5", onlyPositivePer: false } },
  { id: "value",    label: "가치주",  icon: "🏦", filters: { perMax: "15", pbrMax: "1.5", onlyPositivePer: true } },
];

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface Filters {
  mktId: "both" | "STK" | "KSQ";
  sector: string;
  perMin: string;
  perMax: string;
  pbrMin: string;
  pbrMax: string;
  capMin: string;
  capMax: string;
  divYieldMin: string;
  changePctMin: string;
  changePctMax: string;
  onlyPositivePer: boolean;
  onlyPositivePbr: boolean;
}

type SortKey = "per" | "pbr" | "divYield" | "changePct" | "marketCap" | "eps" | "tradingValue";

// ─── 정렬 옵션 (데스크탑 헤더 + 모바일 셀렉트 공용) ────────────────────────────
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "changePct", label: "등락률" },
  { key: "marketCap", label: "시가총액" },
  { key: "per", label: "PER" },
  { key: "pbr", label: "PBR" },
  { key: "eps", label: "EPS" },
  { key: "divYield", label: "배당수익률" },
  { key: "tradingValue", label: "거래대금" },
];

const DEFAULT_FILTERS: Filters = {
  mktId: "both",
  sector: "all",
  perMin: "",
  perMax: "",
  pbrMin: "",
  pbrMax: "",
  capMin: "",
  capMax: "",
  divYieldMin: "",
  changePctMin: "",
  changePctMax: "",
  onlyPositivePer: true,
  onlyPositivePbr: false,
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function fmtCap(v: number): string {
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}조`;
  return `${v.toLocaleString()}억`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtNum(v: number | null, digits = 2): string {
  if (v === null) return "—";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function pctColor(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";
}

// ─── 숫자 입력 ────────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

// ─── 정렬 헤더 ────────────────────────────────────────────────────────────────
function SortHeader({ label, col, current, dir, onSort }: {
  label: string; col: SortKey;
  current: SortKey; dir: "asc" | "desc";
  onSort: (col: SortKey) => void;
}) {
  const active = current === col;
  return (
    <th
      className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">
        {label}
        {active
          ? dir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />
        }
      </span>
    </th>
  );
}

// ─── 필터 패널 ────────────────────────────────────────────────────────────────
function FilterPanel({
  filters, sectors, onChange, onReset,
}: {
  filters: Filters;
  sectors: string[];
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}) {
  return (
    <div className="card">
      <div className="card-body card-body-padded">
        {/* 시장 + 업종 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">시장</label>
            <div className="seg seg-sm">
              {(["both", "STK", "KSQ"] as const).map(m => (
                <button key={m} className={cn("seg-btn", filters.mktId === m && "active")} onClick={() => onChange({ mktId: m })}>
                  {m === "both" ? "전체" : m === "STK" ? "코스피" : "코스닥"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">업종</label>
            <select
              value={filters.sector}
              onChange={e => onChange({ sector: e.target.value })}
              className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">전체 업종</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyPositivePer}
                onChange={e => onChange({ onlyPositivePer: e.target.checked })}
                className="rounded"
              />
              흑자만
            </label>
          </div>
        </div>

        {/* 수치 필터 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">PER</label>
            <div className="flex items-center gap-1">
              <input type="number" value={filters.perMin} onChange={e => onChange({ perMin: e.target.value })}
                placeholder="최소" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <input type="number" value={filters.perMax} onChange={e => onChange({ perMax: e.target.value })}
                placeholder="최대" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">PBR</label>
            <div className="flex items-center gap-1">
              <input type="number" value={filters.pbrMin} onChange={e => onChange({ pbrMin: e.target.value })}
                placeholder="최소" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <input type="number" value={filters.pbrMax} onChange={e => onChange({ pbrMax: e.target.value })}
                placeholder="최대" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>

          <NumInput label="배당수익률 최소 (%)" value={filters.divYieldMin} onChange={v => onChange({ divYieldMin: v })} placeholder="예) 3" />

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">등락률 (%)</label>
            <div className="flex items-center gap-1">
              <input type="number" value={filters.changePctMin} onChange={e => onChange({ changePctMin: e.target.value })}
                placeholder="최소" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <input type="number" value={filters.changePctMax} onChange={e => onChange({ changePctMax: e.target.value })}
                placeholder="최대" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-3">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">시가총액 (억원)</label>
            <div className="flex items-center gap-1">
              <input type="number" value={filters.capMin} onChange={e => onChange({ capMin: e.target.value })}
                placeholder="최소 (억원)" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <input type="number" value={filters.capMax} onChange={e => onChange({ capMax: e.target.value })}
                placeholder="최대 (억원)" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>

          <div className="flex items-end">
            <button className="btn btn-sm" onClick={onReset}>
              <X className="h-3.5 w-3.5" />
              필터 초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 결과 테이블 ──────────────────────────────────────────────────────────────
function ResultTable({ stocks, sortKey, sortDir, onSort, onSortKey, onToggleDir }: {
  stocks: ScreenerStock[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (col: SortKey) => void;
  onSortKey: (key: SortKey) => void;
  onToggleDir: () => void;
}) {
  if (stocks.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        조건에 맞는 종목이 없습니다. 필터를 조정해보세요.
      </div>
    );
  }

  return (
    <>
    <div className="overflow-x-auto desktop-only">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">종목</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">업종</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">현재가</th>
            {SORT_OPTIONS.map(opt => (
              <SortHeader key={opt.key} label={opt.label} col={opt.key} current={sortKey} dir={sortDir} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {stocks.map((s, i) => (
            <tr key={s.code} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{i + 1}</td>
              <td className="px-3 py-2">
                <a href={`/stocks/${s.code}`} className="hover:text-accent transition-colors">
                  <div className="font-medium">{s.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{s.code}</span>
                    <span className={cn(
                      "text-[10px] px-1 rounded font-medium",
                      s.market === "KOSPI" ? "bg-blue-900/50 text-blue-300" : "bg-emerald-900/50 text-emerald-300"
                    )}>
                      {s.market === "KOSPI" ? "코스피" : "코스닥"}
                    </span>
                  </div>
                </a>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{s.sector || "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{s.price.toLocaleString()}</td>
              <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", pctColor(s.changePct))}>
                {fmtPct(s.changePct)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtCap(s.marketCap)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <PerBadge value={s.per} />
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <PbrBadge value={s.pbr} />
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtNum(s.eps, 0)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {s.divYield !== null && s.divYield > 0
                  ? <span className="text-amber-400">{s.divYield.toFixed(2)}%</span>
                  : <span className="text-muted-foreground">—</span>
                }
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtCap(s.tradingValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* 모바일 정렬 컨트롤 */}
    <div className="mobile-only flex items-center gap-2 border-b border-border/20 px-1 py-2">
      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide shrink-0">정렬</label>
      <select
        value={sortKey}
        onChange={e => onSortKey(e.target.value as SortKey)}
        className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {SORT_OPTIONS.map(opt => (
          <option key={opt.key} value={opt.key}>{opt.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggleDir}
        className="h-8 shrink-0 inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {sortDir === "asc" ? "오름차순 ▲" : "내림차순 ▼"}
      </button>
    </div>

    {/* 모바일 카드 리스트 */}
    <div className="mobile-only">
      {stocks.map((s, i) => (
        <a
          key={s.code}
          href={`/stocks/${s.code}`}
          className="flex flex-col gap-1.5 border-b border-border/20 px-1 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">
                <span className="text-muted-foreground font-mono text-xs mr-1.5">{i + 1}</span>
                {s.name}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-mono">{s.code}</span>
                <span className={cn(
                  "text-[10px] px-1 rounded font-medium",
                  s.market === "KOSPI" ? "bg-blue-900/50 text-blue-300" : "bg-emerald-900/50 text-emerald-300"
                )}>
                  {s.market === "KOSPI" ? "코스피" : "코스닥"}
                </span>
                {s.sector && <span className="text-[10px] text-muted-foreground truncate">{s.sector}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono tabular-nums font-semibold">{s.price.toLocaleString()}</div>
              <div className={cn("font-mono tabular-nums text-xs font-semibold", pctColor(s.changePct))}>
                {fmtPct(s.changePct)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono text-muted-foreground">
            <span>PER <PerBadge value={s.per} /></span>
            <span>PBR <PbrBadge value={s.pbr} /></span>
            <span>배당 {s.divYield !== null && s.divYield > 0
              ? <span className="text-amber-400">{s.divYield.toFixed(2)}%</span>
              : "—"}</span>
            <span>시총 {fmtCap(s.marketCap)}</span>
          </div>
        </a>
      ))}
    </div>
    </>
  );
}

function PerBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value <= 0) return <span className="text-muted-foreground text-xs">적자</span>;
  const cls = value < 10 ? "text-emerald-400" : value < 20 ? "text-foreground" : value < 30 ? "text-amber-400" : "text-red-400";
  return <span className={cls}>{value.toFixed(1)}</span>;
}

function PbrBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value <= 0) return <span className="text-muted-foreground">—</span>;
  const cls = value < 0.8 ? "text-emerald-400" : value < 1.5 ? "text-foreground" : value < 3 ? "text-amber-400" : "text-red-400";
  return <span className={cls}>{value.toFixed(2)}</span>;
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 100;

  // 쿼리 파라미터 구성
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("mktId", filters.mktId);
    p.set("sortBy", sortKey);
    p.set("sortDir", sortDir);
    p.set("limit", "500");
    p.set("onlyPositivePer", String(filters.onlyPositivePer));
    if (filters.onlyPositivePbr) p.set("onlyPositivePbr", "true");
    if (filters.sector !== "all") p.set("sector", filters.sector);
    if (filters.perMin) p.set("perMin", filters.perMin);
    if (filters.perMax) p.set("perMax", filters.perMax);
    if (filters.pbrMin) p.set("pbrMin", filters.pbrMin);
    if (filters.pbrMax) p.set("pbrMax", filters.pbrMax);
    if (filters.capMin) p.set("capMin", filters.capMin);
    if (filters.capMax) p.set("capMax", filters.capMax);
    if (filters.divYieldMin) p.set("divYieldMin", filters.divYieldMin);
    if (filters.changePctMin) p.set("changePctMin", filters.changePctMin);
    if (filters.changePctMax) p.set("changePctMax", filters.changePctMax);
    return p.toString();
  }, [filters, sortKey, sortDir]);

  const { data, isLoading, mutate } = useSWR<{
    stocks: ScreenerStock[];
    total: number;
    sectors: string[];
  }>(
    `/api/screener?${queryParams}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );

  const allStocks = data?.stocks ?? [];
  const sectors = data?.sectors ?? [];
  const total = data?.total ?? 0;

  // 클라이언트사이드 이름/코드 검색
  const visibleStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allStocks.filter(s => s.name.toLowerCase().includes(q) || s.code.includes(q))
      : allStocks;
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [allStocks, search, page]);

  const filteredTotal = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allStocks.filter(s => s.name.toLowerCase().includes(q) || s.code.includes(q)).length : total;
  }, [allStocks, search, total]);

  const handleSort = useCallback((col: SortKey) => {
    if (col === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(col); setSortDir("desc"); }
    setPage(0);
  }, [sortKey]);

  const handleFiltersChange = useCallback((patch: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setActivePreset(null);
    setPage(0);
  }, []);

  const handlePreset = useCallback((preset: typeof PRESETS[number]) => {
    if (activePreset === preset.id) {
      setFilters(DEFAULT_FILTERS);
      setActivePreset(null);
    } else {
      setFilters({ ...DEFAULT_FILTERS, ...preset.filters as Partial<Filters> });
      setActivePreset(preset.id);
    }
    setPage(0);
  }, [activePreset]);

  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      {/* 헤더 */}
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>종목 스크리너</h1>
        </div>
        <div className="right">
          <span className="text-xs text-muted-foreground">KRX 공식 데이터 · 30분 캐시</span>
          <button className="btn" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            갱신
          </button>
          <button className="btn" onClick={() => setShowFilters(f => !f)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            필터
          </button>
        </div>
      </div>

      <FeatureTabs tabs={SCREENER_TABS} />

      {/* 프리셋 */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePreset(preset)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
              activePreset === preset.id
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface hover:border-accent/50 hover:bg-muted/30"
            )}
          >
            <span>{preset.icon}</span>
            {preset.label}
          </button>
        ))}
      </div>

      {/* 필터 패널 */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          sectors={sectors}
          onChange={handleFiltersChange}
          onReset={() => { setFilters(DEFAULT_FILTERS); setActivePreset(null); setPage(0); }}
        />
      )}

      {/* 결과 */}
      <div className="card">
        <div className="card-head">
          <div className="flex items-center gap-3">
            <span className="card-title">결과</span>
            {!isLoading && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {filteredTotal.toLocaleString()}종목
              </span>
            )}
          </div>
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="종목명/코드 검색"
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="card-body card-body-padded space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : data && "error" in data ? (
          <div className="card-body card-body-padded py-12 text-center">
            <p className="text-muted-foreground text-sm">KRX 데이터를 불러올 수 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">서버에 KRX_API_KEY 환경변수가 필요합니다.</p>
          </div>
        ) : (
          <div className="card-body">
            <ResultTable
              stocks={visibleStocks}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onSortKey={key => { setSortKey(key); setPage(0); }}
              onToggleDir={() => { setSortDir(d => d === "asc" ? "desc" : "asc"); setPage(0); }}
            />
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="card-body card-body-padded border-t border-border/40 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTotal)} / {filteredTotal.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="btn btn-sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <TrendingDown className="h-3.5 w-3.5 rotate-90" />
              </button>
              <span className="text-xs tabular-nums px-2">{page + 1} / {totalPages}</span>
              <button
                className="btn btn-sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <TrendingUp className="h-3.5 w-3.5 rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 데이터 출처 안내 */}
      <div className="rounded-xl border border-border/40 bg-surface/50 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">데이터 안내</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>시세 · 시가총액 · 거래대금 · 등락률 → KRX 공식 Open API (장 마감 후 확정)</li>
          <li>PER · PBR · EPS · 배당수익률 → KRX 공식 API에 별도 서비스 신청 필요 (현재 미지원으로 표시)</li>
          <li>Forward EPS · Forward PER 는 KRX 미지원 — 개별 종목 상세 페이지에서 Yahoo Finance 기준으로 제공</li>
        </ul>
      </div>
    </div>
  );
}
