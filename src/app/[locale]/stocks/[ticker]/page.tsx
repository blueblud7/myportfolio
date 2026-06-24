"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
  ComposedChart,
  Line,
  ReferenceLine,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, RefreshCw, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockDetailResponse } from "@/app/api/stock-detail/route";
import type { StockPeersResponse, PeerItem, PeerRankingItem } from "@/app/api/stock-peers/route";
import type { KrxStockInvestorDay } from "@/lib/krx";
import type { ExportTrendResponse } from "@/app/api/export-trend/route";
import type { StockEarningsResponse } from "@/app/api/stock-earnings/route";
import type { StockResearchResponse } from "@/app/api/stock-research/route";

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, digits = 2): string {
  if (val == null || !isFinite(val)) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(val: number | null | undefined): string {
  if (val == null || !isFinite(val)) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function fmtMarketCap(val: number | null, currency: string): string {
  if (val == null) return "—";
  const sym = currency === "KRW" ? "₩" : "$";
  const abs = Math.abs(val);
  if (currency === "KRW") {
    if (abs >= 1e12) return `${sym}${(val / 1e12).toFixed(1)}조`;
    if (abs >= 1e8) return `${sym}${(val / 1e8).toFixed(0)}억`;
    return `${sym}${val.toLocaleString("ko-KR")}`;
  }
  if (abs >= 1e12) return `${sym}${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sym}${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sym}${(val / 1e6).toFixed(2)}M`;
  return `${sym}${val.toLocaleString("en-US")}`;
}

function fmtPrice(val: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${Math.round(val).toLocaleString("ko-KR")}`;
  }
  return `$${val.toFixed(val < 10 ? 3 : 2)}`;
}

// ─── 재무제표 지표 정의 ───────────────────────────────────────────────────────

const INCOME_METRICS = [
  { key: "revenue", label: "매출액" },
  { key: "netIncome", label: "순이익" },
  { key: "ebitda", label: "EBITDA" },
  { key: "eps", label: "EPS" },
] as const;

const BALANCE_METRICS = [
  { key: "totalAssets", label: "총자산" },
  { key: "totalDebt", label: "총부채" },
  { key: "cash", label: "현금성자산" },
  { key: "stockholdersEquity", label: "자기자본" },
] as const;

// ─── 기간 필터링 ──────────────────────────────────────────────────────────────

type Period = "1W" | "1M" | "3M" | "6M" | "1Y";

function filterByPeriod(
  chart: StockDetailResponse["chart"],
  period: Period
): StockDetailResponse["chart"] {
  const now = Date.now();
  const msMap: Record<Period, number> = {
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
    "3M": 90 * 24 * 60 * 60 * 1000,
    "6M": 180 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000,
  };
  const cutoff = now - msMap[period];
  return chart.filter((d) => new Date(d.date).getTime() >= cutoff);
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card">
      <div className="card-body card-body-padded">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-bold tabular-nums", color)}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

// ─── 피어 비교 컴포넌트 ───────────────────────────────────────────────────────

type PeerMetric = "trailingPE" | "priceToBook" | "returnOnEquity" | "profitMargins" | "operatingMargins" | "revenueGrowth";

const PEER_METRICS: { key: PeerMetric; label: string; suffix: string }[] = [
  { key: "trailingPE",      label: "PER",      suffix: "x"  },
  { key: "priceToBook",     label: "PBR",      suffix: "x"  },
  { key: "returnOnEquity",  label: "ROE",      suffix: "%"  },
  { key: "profitMargins",   label: "순이익률", suffix: "%"  },
  { key: "operatingMargins",label: "영업이익률",suffix: "%"  },
  { key: "revenueGrowth",   label: "매출성장", suffix: "%"  },
];

function fmtVal(v: number | null, suffix: string): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(suffix === "x" ? 1 : 1)}${suffix}`;
}

function fmtMcap(v: number | null, currency: string): string {
  if (v == null) return "—";
  if (currency === "KRW") {
    if (v >= 1e12) return `₩${(v / 1e12).toFixed(1)}조`;
    if (v >= 1e8)  return `₩${(v / 1e8).toFixed(0)}억`;
    return `₩${v.toLocaleString()}`;
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function PeerComparison({ ticker }: { ticker: string }) {
  const [peers, setPeers]       = useState<StockPeersResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [fetched, setFetched]   = useState(false);
  const [chartMetric, setChartMetric] = useState<PeerMetric>("trailingPE");

  const load = () => {
    setLoading(true);
    setFetched(false);
    fetch(`/api/stock-peers?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: StockPeersResponse & { error?: string }) => {
        if (d?.error || !Array.isArray(d?.peers)) {
          setPeers(null);
        } else {
          setPeers(d);
        }
        setFetched(true);
      })
      .catch(() => setFetched(true))
      .finally(() => setLoading(false));
  };

  const chartData = useMemo(() => {
    if (!peers?.peers) return [];
    const metric = PEER_METRICS.find((m) => m.key === chartMetric)!;
    return peers.peers
      .map((p) => ({ name: p.ticker, value: p[chartMetric], isTarget: p.isTarget }))
      .filter((d) => d.value != null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .map((d) => ({ ...d, label: `${(d.value ?? 0).toFixed(1)}${metric.suffix}` }));
  }, [peers, chartMetric]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <p className="text-sm">AI가 피어 종목을 분석 중...</p>
      </div>
    );
  }

  if (!fetched) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <p className="text-sm">AI가 동종업계 피어를 찾아 지표를 비교합니다.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/30 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          피어 비교 불러오기
        </button>
      </div>
    );
  }

  if (!peers?.peers || peers.peers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <p className="text-sm text-center">피어 데이터를 가져올 수 없습니다.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg bg-zinc-500/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-zinc-500/30 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          다시 시도
        </button>
      </div>
    );
  }

  const metricSuffix = PEER_METRICS.find((m) => m.key === chartMetric)?.suffix ?? "";

  return (
    <div className="space-y-6">
      {/* 차트 */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">지표 선택:</span>
          {PEER_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setChartMetric(m.key)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                chartMetric === m.key
                  ? "bg-blue-500/20 text-blue-300"
                  : "text-muted-foreground hover:bg-zinc-800"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number" hide domain={["auto", "auto"]} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}${metricSuffix}`, PEER_METRICS.find((m) => m.key === chartMetric)?.label]}
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isTarget ? "#3b82f6" : "#52525b"} />
                ))}
                <LabelList dataKey="label" position="right" style={{ fontSize: 11, fill: "#a1a1aa" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 비교 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">종목</th>
              <th className="pb-2 px-3 text-right font-medium">시가총액</th>
              {PEER_METRICS.map((m) => (
                <th key={m.key} className="pb-2 px-3 text-right font-medium">{m.label}</th>
              ))}
              <th className="pb-2 pl-3 text-right font-medium">베타</th>
            </tr>
          </thead>
          <tbody>
            {peers.peers.map((p: PeerItem) => (
              <tr
                key={p.ticker}
                className={cn(
                  "border-b border-border/50 transition-colors",
                  p.isTarget
                    ? "bg-blue-500/10 font-semibold"
                    : "hover:bg-zinc-800/30"
                )}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    {p.isTarget && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />}
                    <span className={cn("font-mono", p.isTarget && "text-blue-300")}>{p.ticker}</span>
                    <span className="truncate max-w-[100px] text-zinc-400">{p.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">{fmtMcap(p.marketCap, p.currency)}</td>
                {PEER_METRICS.map((m) => {
                  const val = p[m.key];
                  const isGood =
                    m.key === "returnOnEquity" || m.key === "profitMargins" || m.key === "operatingMargins" || m.key === "revenueGrowth"
                      ? val != null && val > 0
                      : null;
                  return (
                    <td
                      key={m.key}
                      className={cn(
                        "py-2.5 px-3 text-right tabular-nums",
                        isGood === true ? "text-emerald-400" : isGood === false ? "text-red-400" : ""
                      )}
                    >
                      {fmtVal(val, m.suffix)}
                    </td>
                  );
                })}
                <td className="py-2.5 pl-3 text-right tabular-nums text-zinc-400">{fmtVal(p.beta, "x")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI 우선순위 랭킹 */}
      {peers.ranking && peers.ranking.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-semibold">AI 투자 우선순위</span>
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">AI 분석</span>
          </div>
          <div className="space-y-2">
            {peers.ranking.map((r: PeerRankingItem) => {
              const peer = peers.peers.find((p) => p.ticker === r.ticker);
              const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : null;
              return (
                <div
                  key={r.ticker}
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-3 py-2 text-sm",
                    r.rank <= 3 ? "bg-zinc-800/60" : "opacity-70",
                    peer?.isTarget && "ring-1 ring-blue-500/40"
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-base leading-none mt-0.5">
                    {medal ?? <span className="font-mono text-xs text-zinc-500">{r.rank}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-mono font-semibold text-xs", peer?.isTarget ? "text-blue-300" : "text-zinc-200")}>
                        {r.ticker}
                      </span>
                      {peer && (
                        <span className="truncate text-xs text-zinc-500">{peer.name}</span>
                      )}
                      {peer?.isTarget && (
                        <span className="rounded bg-blue-500/20 px-1 py-0.5 text-[9px] text-blue-400">보유</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed">{r.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-600">* AI가 선정한 피어 목록 · Yahoo Finance 기준 · 1시간 캐시</p>
    </div>
  );
}

// ─── 투자자별 매매동향 차트 (한국 주식 전용) ──────────────────────────────────

function KrxInvestorChart({ ticker }: { ticker: string }) {
  const [data, setData] = useState<KrxStockInvestorDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"value" | "volume">("value");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/krx/investor-trends?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then((d: KrxStockInvestorDay[]) => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg bg-muted/30" />;
  }
  if (!data.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        데이터 없음 (KRX API 조회 실패 또는 거래 없음)
      </p>
    );
  }

  // 백만원 → 억원 변환
  const chartData = data.map(d => ({
    date: d.date.slice(5), // MM-DD
    외국인: view === "value" ? Math.round(d.foreign / 100) : d.foreignVol,
    기관: view === "value" ? Math.round(d.institution / 100) : d.institutionVol,
    개인: view === "value" ? Math.round(d.individual / 100) : d.individualVol,
  }));

  const unit = view === "value" ? "억원" : "주";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">30거래일 투자자별 순매수 · KRX 공식 데이터</p>
        <div className="flex gap-1">
          {(["value", "volume"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v === "value" ? "금액" : "수량"}
            </button>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-blue-400" />외국인</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-orange-400" />기관</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-emerald-400" />개인</span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={52}
            tickFormatter={(v: number) => v >= 0 ? `+${(v/100).toFixed(0)}` : `${(v/100).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${(value as number) > 0 ? "+" : ""}${(value as number).toLocaleString()} ${unit}`]}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Bar dataKey="외국인" fill="#60a5fa" radius={[2, 2, 0, 0]} maxBarSize={8} />
          <Bar dataKey="기관" fill="#fb923c" radius={[2, 2, 0, 0]} maxBarSize={8} />
          <Bar dataKey="개인" fill="#34d399" radius={[2, 2, 0, 0]} maxBarSize={8} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 최근 5일 요약 테이블 */}
      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="py-1.5 text-left font-medium text-muted-foreground">날짜</th>
                <th className="py-1.5 text-right font-medium text-blue-400">외국인</th>
                <th className="py-1.5 text-right font-medium text-orange-400">기관</th>
                <th className="py-1.5 text-right font-medium text-emerald-400">개인</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(-5).reverse().map(d => (
                <tr key={d.date} className="border-b border-border/30">
                  <td className="py-1 text-muted-foreground font-mono">{d.date.slice(5)}</td>
                  <td className={cn("py-1 text-right tabular-nums font-mono", d.foreign > 0 ? "text-emerald-400" : d.foreign < 0 ? "text-red-400" : "text-muted-foreground")}>
                    {d.foreign > 0 ? "+" : ""}{Math.round(d.foreign / 100).toLocaleString()}억
                  </td>
                  <td className={cn("py-1 text-right tabular-nums font-mono", d.institution > 0 ? "text-emerald-400" : d.institution < 0 ? "text-red-400" : "text-muted-foreground")}>
                    {d.institution > 0 ? "+" : ""}{Math.round(d.institution / 100).toLocaleString()}억
                  </td>
                  <td className={cn("py-1 text-right tabular-nums font-mono", d.individual > 0 ? "text-emerald-400" : d.individual < 0 ? "text-red-400" : "text-muted-foreground")}>
                    {d.individual > 0 ? "+" : ""}{Math.round(d.individual / 100).toLocaleString()}억
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

// ─── 수출추이 (한국 수출주 전용 · 관세청 데이터) ──────────────────────────────

function fmtUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString("en-US")}`;
}

function ExportTrendChart({ ticker }: { ticker: string }) {
  const [resp, setResp] = useState<ExportTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/export-trend?ticker=${encodeURIComponent(ticker)}&months=18`)
      .then(r => r.json())
      .then((d: ExportTrendResponse) => setResp(d))
      .catch(() => setResp(null))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <div className="h-48 animate-pulse rounded-lg bg-muted/30" />;
  // 수출 매핑이 없는 종목은 섹션 자체를 숨김
  if (!resp || !resp.supported) return null;

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h3 className="card-title">수출 추이</h3>
          <span className="text-xs text-muted-foreground font-normal">
            관세청 · {resp.item ?? ""}{resp.hs ? ` (HS ${resp.hs})` : ""}
          </span>
        </div>
      </div>
      <div className="card-body card-body-padded">{children}</div>
    </div>
  );

  if (!resp.configured) {
    return <Wrapper><p className="py-6 text-center text-sm text-muted-foreground">관세청 API 키 미설정 (DATA_GO_KR_KEY)</p></Wrapper>;
  }
  const months = resp.total?.months ?? [];
  if (!months.length) {
    return <Wrapper><p className="py-6 text-center text-sm text-muted-foreground">데이터 없음</p></Wrapper>;
  }

  const chartData = months.map(m => ({
    ym: `${m.yymm.slice(2, 4)}.${m.yymm.slice(4, 6)}`,
    exp: m.expUsd / 1e9, // $B
    yoy: m.expYoY,
  }));
  const latest = resp.total!.latest!;

  return (
    <Wrapper>
      <div className="space-y-3">
        {/* 요약 */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">최신({`${latest.yymm.slice(0, 4)}.${latest.yymm.slice(4, 6)}`})</span>
            <span className="text-lg font-bold tabular-nums">{fmtUsd(latest.expUsd)}</span>
          </div>
          {latest.expYoY != null && (
            <span className={cn("text-sm font-medium tabular-nums", latest.expYoY >= 0 ? "text-emerald-400" : "text-red-400")}>
              전년比 {fmtPct(latest.expYoY)}
            </span>
          )}
          {/* 국가별 최신월 YoY */}
          {resp.byCountry.filter(c => c.trend?.latest?.expYoY != null).map(c => (
            <span key={c.code} className="text-xs text-muted-foreground">
              {c.label} <span className={cn("font-medium", (c.trend!.latest!.expYoY ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtPct(c.trend!.latest!.expYoY)}</span>
            </span>
          ))}
        </div>

        {/* 범례 */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-blue-400" />월 수출액($B)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-amber-400" />전년동월비(%)</span>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="ym" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
            <YAxis yAxisId="exp" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
              tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
            <YAxis yAxisId="yoy" orientation="right" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => name === "exp"
                ? [`$${(value as number).toFixed(2)}B`, "월 수출액"]
                : [value == null ? "—" : `${(value as number) >= 0 ? "+" : ""}${(value as number).toFixed(1)}%`, "전년동월비"]}
            />
            <ReferenceLine yAxisId="yoy" y={0} stroke="var(--border)" strokeWidth={1} />
            <Bar yAxisId="exp" dataKey="exp" fill="#60a5fa" radius={[2, 2, 0, 0]} maxBarSize={18} />
            <Line yAxisId="yoy" type="monotone" dataKey="yoy" stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>

        <p className="text-xs text-muted-foreground">
          종목 실적의 선행지표 — 대표 품목({resp.item})의 월별 수출 증감입니다. 개별 기업 실적과 정확히 일치하지 않을 수 있습니다.
        </p>
      </div>
    </Wrapper>
  );
}

// ─── 분기 실적 추이 + EPS 서프라이즈 (미국 종목) ──────────────────────────────

function QuarterlyEarningsChart({ ticker }: { ticker: string }) {
  const [resp, setResp] = useState<StockEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock-earnings?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then((d: StockEarningsResponse) => setResp(d))
      .catch(() => setResp(null))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <div className="h-48 animate-pulse rounded-lg bg-muted/30" />;
  if (!resp || !resp.supported || resp.quarters.length === 0) return null;

  const qs = resp.quarters;
  const chartData = qs.map(q => ({
    q: q.quarter.replace(/(\dQ)(\d{4})/, "$2 $1"), // "2025 1Q"
    actual: q.epsActual,
    estimate: q.epsEstimate,
    surprise: q.surprisePct,
  }));
  const beats = qs.filter(q => q.surprisePct != null && q.surprisePct > 0).length;
  const counted = qs.filter(q => q.surprisePct != null).length;
  const last = qs[qs.length - 1];

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <h3 className="card-title">분기 실적 · EPS 서프라이즈</h3>
          <span className="text-xs text-muted-foreground font-normal">Yahoo</span>
        </div>
      </div>
      <div className="card-body card-body-padded">
        <div className="space-y-3">
          {/* 요약 */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            {last.surprisePct != null && (
              <span>
                최신({last.quarter}) 서프라이즈{" "}
                <span className={cn("font-semibold tabular-nums", last.surprisePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {fmtPct(last.surprisePct)}
                </span>
              </span>
            )}
            {counted > 0 && (
              <span className="text-muted-foreground">
                최근 {counted}분기 중 <span className="font-medium text-emerald-400">{beats}회</span> 컨센서스 상회
              </span>
            )}
          </div>

          {/* 범례 */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-blue-400" />EPS 실적</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-zinc-500" />EPS 컨센서스</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded bg-amber-400" />서프라이즈(%)</span>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="q" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="eps" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="sp" orientation="right" tick={{ fill: "var(--fg-4)", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => {
                  if (value == null) return ["—", name];
                  if (name === "surprise") return [`${(value as number) >= 0 ? "+" : ""}${(value as number).toFixed(1)}%`, "서프라이즈"];
                  return [(value as number).toFixed(2), name === "actual" ? "EPS 실적" : "EPS 컨센서스"];
                }}
              />
              <ReferenceLine yAxisId="sp" y={0} stroke="var(--border)" strokeWidth={1} />
              <Bar yAxisId="eps" dataKey="estimate" fill="#71717a" radius={[2, 2, 0, 0]} maxBarSize={14} />
              <Bar yAxisId="eps" dataKey="actual" fill="#60a5fa" radius={[2, 2, 0, 0]} maxBarSize={14} />
              <Line yAxisId="sp" type="monotone" dataKey="surprise" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 분기 테이블 (매출 있으면 포함) */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">분기</th>
                  <th className="py-1.5 text-right font-medium">EPS 실적</th>
                  <th className="py-1.5 text-right font-medium">컨센서스</th>
                  <th className="py-1.5 text-right font-medium">서프라이즈</th>
                </tr>
              </thead>
              <tbody>
                {qs.slice().reverse().map(q => (
                  <tr key={q.quarter} className="border-b border-border/30">
                    <td className="py-1 font-mono text-muted-foreground">{q.quarter}</td>
                    <td className="py-1 text-right tabular-nums font-mono">{q.epsActual != null ? q.epsActual.toFixed(2) : "—"}</td>
                    <td className="py-1 text-right tabular-nums font-mono text-muted-foreground">{q.epsEstimate != null ? q.epsEstimate.toFixed(2) : "—"}</td>
                    <td className={cn("py-1 text-right tabular-nums font-mono", q.surprisePct == null ? "text-muted-foreground" : q.surprisePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {q.surprisePct != null ? fmtPct(q.surprisePct) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI 종합요약 (버튼 클릭 시 생성 · pull) ───────────────────────────────────

function AiSummaryCard({ data, ticker, isKorean }: { data: StockDetailResponse; ticker: string; isKorean: boolean }) {
  const [summary, setSummary] = useState<import("@/app/api/stock-summary/route").StockSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      // 수출 모멘텀(한국 수출주만) 함께 첨부
      let exportTrend: { item: string; latestYymm: string; latestUsd: number; latestYoY: number | null } | null = null;
      if (isKorean) {
        try {
          const er = await fetch(`/api/export-trend?ticker=${encodeURIComponent(ticker)}&months=3`).then(r => r.json()) as ExportTrendResponse;
          const l = er.total?.latest;
          if (er.supported && er.item && l) {
            exportTrend = { item: er.item, latestYymm: l.yymm, latestUsd: l.expUsd, latestYoY: l.expYoY };
          }
        } catch { /* 무시 */ }
      }

      const metrics = {
        price: data.price,
        changePct: data.changePct,
        "52주범위내위치%": data.fiftyTwoWeekHigh > data.fiftyTwoWeekLow
          ? Math.round(((data.price - data.fiftyTwoWeekLow) / (data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow)) * 100)
          : null,
        PER: data.trailingPE, 선행PER: data.forwardPE, PBR: data.priceToBook,
        PSR: data.priceToSales, EVEBITDA: data.evToEbitda, PEG: data.pegRatio,
        ROE: data.returnOnEquity, ROA: data.returnOnAssets,
        매출총이익률: data.grossMargins, 영업이익률: data.operatingMargins, 순이익률: data.profitMargins,
        매출성장률: data.revenueGrowth, 이익성장률: data.earningsGrowth,
        배당수익률: data.dividendYield, 베타: data.beta, 시가총액: data.marketCap,
        섹터: data.sector, 산업: data.industry,
      };

      const res = await fetch("/api/stock-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: data.ticker, name: data.name, currency: data.currency, metrics, exportTrend }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "생성 실패");
      }
      setSummary(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  };

  const stanceMeta: Record<string, { label: string; cls: string }> = {
    bullish: { label: "긍정적", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    neutral: { label: "중립", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    bearish: { label: "부정적", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const toneCls: Record<string, string> = {
    positive: "text-emerald-400", negative: "text-red-400", neutral: "text-muted-foreground",
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <h3 className="card-title">AI 종합요약</h3>
          {summary && (
            <span className={cn("badge border text-xs", stanceMeta[summary.stance]?.cls)}>
              {stanceMeta[summary.stance]?.label}
            </span>
          )}
        </div>
        <button className="btn btn-sm" onClick={generate} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          <span>{loading ? "생성 중…" : summary ? "다시 생성" : "생성"}</span>
        </button>
      </div>
      <div className="card-body card-body-padded">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!summary && !error && (
          <p className="text-sm text-muted-foreground">
            밸류에이션·성장·수익성{isKorean ? "·수출 모멘텀" : ""}을 종합한 AI 의견을 생성합니다.
          </p>
        )}
        {summary && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{summary.thesis}</p>
            {summary.signals.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {summary.signals.map((s, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-sm">
                    <span className={cn("font-medium shrink-0", toneCls[s.tone])}>
                      {s.tone === "positive" ? "▲" : s.tone === "negative" ? "▼" : "•"} {s.label}
                    </span>
                    <span className="text-muted-foreground">{s.detail}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">AI 생성 · 투자 판단의 참고용이며 정확성을 보장하지 않습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 경량 마크다운 렌더러 ─────────────────────────────────────────────────────

function MdLite({ text }: { text: string }) {
  const strip = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`(.*?)`/g, "$1");
  return (
    <div className="space-y-0.5">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("### ")) return <h4 key={i} className="mt-3 mb-1 text-sm font-semibold">{strip(line.slice(4))}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="mt-4 mb-1 text-base font-bold">{strip(line.slice(3))}</h3>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{strip(line.slice(2))}</li>;
        if (line.match(/^\d+\.\s/)) return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{strip(line.replace(/^\d+\.\s/, ""))}</li>;
        if (line === "---") return <hr key={i} className="my-3" style={{ borderColor: "var(--border)" }} />;
        if (line.trim()) return <p key={i} className="text-sm leading-relaxed text-muted-foreground">{strip(line)}</p>;
        return <div key={i} className="h-2" />;
      })}
    </div>
  );
}

// ─── AI 심층 리서치 에이전트 (버튼 클릭 · pull) ───────────────────────────────

function AiResearchCard({ ticker, name }: { ticker: string; name: string }) {
  const [resp, setResp] = useState<StockResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "리서치 실패");
      }
      setResp(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "리서치 실패");
    } finally {
      setLoading(false);
    }
  };

  const stanceMeta: Record<string, { label: string; cls: string }> = {
    bullish: { label: "강세 우위", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    neutral: { label: "중립", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    bearish: { label: "약세 우위", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <h3 className="card-title">AI 심층 리서치</h3>
          <span className="text-xs text-muted-foreground font-normal">에이전트 · 뉴스·애널리스트·실적·수출·웹</span>
          {resp && (
            <span className={cn("badge border text-xs", stanceMeta[resp.stance]?.cls)}>{stanceMeta[resp.stance]?.label}</span>
          )}
        </div>
        <button className="btn btn-sm" onClick={generate} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          <span>{loading ? "조사 중…" : resp ? "다시 조사" : "리서치 생성"}</span>
        </button>
      </div>
      <div className="card-body card-body-padded">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && !resp && (
          <p className="text-sm text-muted-foreground">에이전트가 뉴스·애널리스트·실적·수출 데이터를 자율 조사 중입니다. 20~60초 걸릴 수 있어요…</p>
        )}
        {!resp && !error && !loading && (
          <p className="text-sm text-muted-foreground">AI 에이전트가 여러 소스를 직접 조사해 강세/약세 논거와 리포트를 만듭니다.</p>
        )}
        {resp && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="mb-1.5 text-xs font-semibold text-emerald-400">▲ 강세 요인</p>
                {resp.bullish.length ? (
                  <ul className="space-y-1">{resp.bullish.map((b, i) => <li key={i} className="text-sm leading-relaxed">· {b}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="mb-1.5 text-xs font-semibold text-red-400">▼ 약세 요인</p>
                {resp.bearish.length ? (
                  <ul className="space-y-1">{resp.bearish.map((b, i) => <li key={i} className="text-sm leading-relaxed">· {b}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
            </div>
            {resp.report_md && <MdLite text={resp.report_md} />}
            <p className="text-xs text-muted-foreground">🤖 에이전트 분석 (도구 {resp.toolCalls}회 호출) · 투자 판단 참고용, 정확성 보장 안 함.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string; locale: string }>;
}) {
  const { ticker } = use(params);
  const router = useRouter();
  const [data, setData] = useState<StockDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("1Y");

  const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/stock-detail?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => {
        if ("error" in d) {
          setError(d.error);
        } else {
          setData(d as StockDetailResponse);
        }
      })
      .catch(() => setError("데이터를 불러오는 중 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [ticker]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return filterByPeriod(data.chart, period);
  }, [data, period]);

  const chartMin = useMemo(() => {
    if (chartData.length === 0) return 0;
    const min = Math.min(...chartData.map((d) => d.close));
    return Math.floor(min * 0.98);
  }, [chartData]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map((d) => d.close));
    return Math.ceil(max * 1.02);
  }, [chartData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted/40 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> 뒤로
        </button>
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {error ?? "종목 정보를 찾을 수 없습니다."}
        </div>
      </div>
    );
  }

  const priceColor =
    data.changePct > 0
      ? "text-emerald-400"
      : data.changePct < 0
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start gap-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-1 flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{data.ticker}</h1>
              <span className="text-lg text-muted-foreground font-medium">{data.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("text-2xl font-bold tabular-nums", priceColor)}>
                {fmtPrice(data.price, data.currency)}
              </span>
              <span
                className={cn(
                  "badge font-mono text-xs",
                  data.changePct >= 0 ? "badge-up" : "badge-down"
                )}
              >
                {fmtPct(data.changePct)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {data.sector && (
              <span className="badge badge-outline text-xs">
                <Building2 className="mr-1 h-3 w-3" />
                {data.sector}
              </span>
            )}
            {data.industry && (
              <span className="badge badge-outline text-xs text-muted-foreground">
                {data.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI 종합요약 (버튼 생성) */}
      <AiSummaryCard data={data} ticker={ticker} isKorean={isKorean} />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="현재가"
          value={fmtPrice(data.price, data.currency)}
          sub={`52W: ${fmtPrice(data.fiftyTwoWeekLow, data.currency)} – ${fmtPrice(data.fiftyTwoWeekHigh, data.currency)}`}
          color={priceColor}
        />
        <StatCard label="시가총액" value={fmtMarketCap(data.marketCap, data.currency)} />
        <StatCard
          label="PER (Trailing)"
          value={fmt(data.trailingPE)}
          sub={data.forwardPE != null ? `Forward: ${fmt(data.forwardPE)}` : undefined}
        />
        <StatCard label="PBR" value={fmt(data.priceToBook)} />
        <StatCard
          label="EPS (Trailing)"
          value={data.trailingEps != null ? fmt(data.trailingEps) : "—"}
          sub={data.forwardEps != null ? `Forward: ${fmt(data.forwardEps)}` : undefined}
        />
        <StatCard
          label="Beta"
          value={fmt(data.beta)}
          color={
            data.beta != null
              ? data.beta > 1.2
                ? "text-amber-400"
                : data.beta < 0.8
                ? "text-blue-400"
                : undefined
              : undefined
          }
        />
      </div>

      {/* 차트 */}
      <div className="card">
        <div className="card-head">
          <div><h3 className="card-title">주가 차트</h3></div>
          <div className="flex gap-1">
            {(["1W", "1M", "3M", "6M", "1Y"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-muted-foreground hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body card-body-padded">
          {chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              차트 데이터 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="closeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[chartMin, chartMax]}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) =>
                    data.currency === "KRW"
                      ? `${(v / 1000).toFixed(0)}K`
                      : `$${v.toFixed(0)}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [
                    fmtPrice(value as number, data.currency),
                    "종가",
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labelFormatter={(label: any) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  fill="url(#closeGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#3b82f6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 밸류에이션 & 수익성 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card">
          <div className="card-head"><div><h3 className="card-title text-sm font-semibold text-muted-foreground uppercase tracking-wide">밸류에이션</h3></div></div>
          <div className="card-body card-body-padded">
            <MetricRow label="PER (Trailing)" value={fmt(data.trailingPE)} />
            <MetricRow label="PER (Forward)" value={fmt(data.forwardPE)} />
            <MetricRow label="PEG Ratio" value={fmt(data.pegRatio)} />
            <MetricRow label="P/B Ratio" value={fmt(data.priceToBook)} />
            <MetricRow label="P/S Ratio" value={fmt(data.priceToSales)} />
            <MetricRow label="EV/EBITDA" value={fmt(data.evToEbitda)} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><h3 className="card-title text-sm font-semibold text-muted-foreground uppercase tracking-wide">수익성 &amp; 배당</h3></div></div>
          <div className="card-body card-body-padded">
            <MetricRow label="매출총이익률" value={fmtPct(data.grossMargins)} />
            <MetricRow label="영업이익률" value={fmtPct(data.operatingMargins)} />
            <MetricRow label="순이익률" value={fmtPct(data.profitMargins)} />
            <MetricRow label="ROE" value={fmtPct(data.returnOnEquity)} />
            <MetricRow label="ROA" value={fmtPct(data.returnOnAssets)} />
            <MetricRow label="배당수익률" value={fmtPct(data.dividendYield)} />
            <MetricRow label="배당성향" value={fmtPct(data.payoutRatio)} />
          </div>
        </div>
      </div>

      {/* 성장 지표 */}
      <div className="card">
        <div className="card-head"><div><h3 className="card-title text-sm font-semibold text-muted-foreground uppercase tracking-wide">성장</h3></div></div>
        <div className="card-body card-body-padded grid grid-cols-2 gap-x-8 sm:grid-cols-4">
          <div className="py-2">
            <p className="text-xs text-muted-foreground">매출 성장 (YoY)</p>
            <p
              className={cn(
                "mt-1 text-lg font-bold tabular-nums",
                data.revenueGrowth != null && data.revenueGrowth >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              )}
            >
              {fmtPct(data.revenueGrowth)}
            </p>
          </div>
          <div className="py-2">
            <p className="text-xs text-muted-foreground">순이익 성장 (YoY)</p>
            <p
              className={cn(
                "mt-1 text-lg font-bold tabular-nums",
                data.earningsGrowth != null && data.earningsGrowth >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              )}
            >
              {fmtPct(data.earningsGrowth)}
            </p>
          </div>
          <div className="py-2">
            <p className="text-xs text-muted-foreground">EPS (Trailing)</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{fmt(data.trailingEps)}</p>
          </div>
          <div className="py-2">
            <p className="text-xs text-muted-foreground">EPS (Forward)</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{fmt(data.forwardEps)}</p>
          </div>
        </div>
      </div>

      {/* 재무제표 */}
      <div className="card">
        <div className="card-head"><div><h3 className="card-title">재무제표</h3></div></div>
        <div className="card-body card-body-padded">
          <Tabs defaultValue="income">
            <TabsList className="mb-4">
              <TabsTrigger value="income">손익계산서</TabsTrigger>
              <TabsTrigger value="balance">재무상태표</TabsTrigger>
            </TabsList>

            <TabsContent value="income">
              {data.incomeStatement.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
              ) : (
                <>
                  <div className="overflow-x-auto desktop-only">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="py-2 text-left font-medium text-muted-foreground text-xs">
                            항목
                          </th>
                          {data.incomeStatement.map((r) => (
                            <th
                              key={r.date}
                              className="py-2 text-right font-medium text-muted-foreground text-xs"
                            >
                              {r.date}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {INCOME_METRICS.map(({ key, label }) => (
                          <tr key={key} className="border-b border-border/30 last:border-0">
                            <td className="py-2 text-muted-foreground">{label}</td>
                            {data.incomeStatement.map((r) => {
                              const val = r[key];
                              return (
                                <td key={r.date} className="py-2 text-right font-mono">
                                  {val == null
                                    ? "—"
                                    : key === "eps"
                                    ? fmt(val)
                                    : fmtMarketCap(val, data.currency)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-only flex flex-col gap-3">
                    {data.incomeStatement.map((r) => (
                      <div key={r.date} className="rounded-lg border border-border/50 p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          {r.date}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {INCOME_METRICS.map(({ key, label }) => {
                            const val = r[key];
                            return (
                              <div key={key} className="flex flex-col">
                                <span className="text-xs text-muted-foreground">{label}</span>
                                <span className="font-mono text-sm">
                                  {val == null
                                    ? "—"
                                    : key === "eps"
                                    ? fmt(val)
                                    : fmtMarketCap(val, data.currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="balance">
              {data.balanceSheet.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
              ) : (
                <>
                  <div className="overflow-x-auto desktop-only">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="py-2 text-left font-medium text-muted-foreground text-xs">
                            항목
                          </th>
                          {data.balanceSheet.map((r) => (
                            <th
                              key={r.date}
                              className="py-2 text-right font-medium text-muted-foreground text-xs"
                            >
                              {r.date}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {BALANCE_METRICS.map(({ key, label }) => (
                          <tr key={key} className="border-b border-border/30 last:border-0">
                            <td className="py-2 text-muted-foreground">{label}</td>
                            {data.balanceSheet.map((r) => {
                              const val = r[key];
                              return (
                                <td key={r.date} className="py-2 text-right font-mono">
                                  {val == null ? "—" : fmtMarketCap(val, data.currency)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-only flex flex-col gap-3">
                    {data.balanceSheet.map((r) => (
                      <div key={r.date} className="rounded-lg border border-border/50 p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          {r.date}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {BALANCE_METRICS.map(({ key, label }) => {
                            const val = r[key];
                            return (
                              <div key={key} className="flex flex-col">
                                <span className="text-xs text-muted-foreground">{label}</span>
                                <span className="font-mono text-sm">
                                  {val == null ? "—" : fmtMarketCap(val, data.currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 분기 실적 · EPS 서프라이즈 (미국 종목 — 데이터 없으면 자동 숨김) */}
      <QuarterlyEarningsChart ticker={ticker} />

      {/* 투자자별 매매동향 (한국 주식 전용) */}
      {isKorean && (
        <div className="card">
          <div className="card-head">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="card-title">투자자별 매매동향</h3>
              <span className="text-xs text-muted-foreground font-normal">KRX 공식</span>
            </div>
          </div>
          <div className="card-body card-body-padded">
            <KrxInvestorChart ticker={ticker} />
          </div>
        </div>
      )}

      {/* 수출 추이 (한국 수출주 전용 — 비수출주는 자동 숨김) */}
      {isKorean && <ExportTrendChart ticker={ticker} />}

      {/* 피어 비교 */}
      <div className="card">
        <div className="card-head"><div><h3 className="card-title">동종업계 피어 비교</h3></div></div>
        <div className="card-body card-body-padded">
          <PeerComparison ticker={ticker} />
        </div>
      </div>

      {/* 기업 정보 */}
      {(data.sector || data.industry || data.description) && (
        <div className="card">
          <div className="card-head"><div><h3 className="card-title">기업 정보</h3></div></div>
          <div className="card-body card-body-padded space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              {data.sector && (
                <div>
                  <span className="text-muted-foreground">섹터: </span>
                  <span className="font-medium">{data.sector}</span>
                </div>
              )}
              {data.industry && (
                <div>
                  <span className="text-muted-foreground">산업: </span>
                  <span className="font-medium">{data.industry}</span>
                </div>
              )}
            </div>
            {data.description && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
                {data.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI 심층 리서치 에이전트 (버튼 생성) */}
      <AiResearchCard ticker={ticker} name={data.name} />
    </div>
  );
}
