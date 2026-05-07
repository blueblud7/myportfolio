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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockDetailResponse } from "@/app/api/stock-detail/route";

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
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-bold tabular-nums", color)}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
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
              <Badge
                variant={data.changePct >= 0 ? "default" : "destructive"}
                className={cn(
                  "font-mono text-xs",
                  data.changePct >= 0
                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/20"
                )}
              >
                {fmtPct(data.changePct)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {data.sector && (
              <Badge variant="outline" className="text-xs">
                <Building2 className="mr-1 h-3 w-3" />
                {data.sector}
              </Badge>
            )}
            {data.industry && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {data.industry}
              </Badge>
            )}
          </div>
        </div>
      </div>

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
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">주가 차트</CardTitle>
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
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* 밸류에이션 & 수익성 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              밸류에이션
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MetricRow label="PER (Trailing)" value={fmt(data.trailingPE)} />
            <MetricRow label="PER (Forward)" value={fmt(data.forwardPE)} />
            <MetricRow label="PEG Ratio" value={fmt(data.pegRatio)} />
            <MetricRow label="P/B Ratio" value={fmt(data.priceToBook)} />
            <MetricRow label="P/S Ratio" value={fmt(data.priceToSales)} />
            <MetricRow label="EV/EBITDA" value={fmt(data.evToEbitda)} />
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              수익성 & 배당
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MetricRow label="매출총이익률" value={fmtPct(data.grossMargins)} />
            <MetricRow label="영업이익률" value={fmtPct(data.operatingMargins)} />
            <MetricRow label="순이익률" value={fmtPct(data.profitMargins)} />
            <MetricRow label="ROE" value={fmtPct(data.returnOnEquity)} />
            <MetricRow label="ROA" value={fmtPct(data.returnOnAssets)} />
            <MetricRow label="배당수익률" value={fmtPct(data.dividendYield)} />
            <MetricRow label="배당성향" value={fmtPct(data.payoutRatio)} />
          </CardContent>
        </Card>
      </div>

      {/* 성장 지표 */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            성장
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 px-4 pb-4 sm:grid-cols-4">
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
        </CardContent>
      </Card>

      {/* 재무제표 */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">재무제표</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="income">
            <TabsList className="mb-4">
              <TabsTrigger value="income">손익계산서</TabsTrigger>
              <TabsTrigger value="balance">재무상태표</TabsTrigger>
            </TabsList>

            <TabsContent value="income">
              {data.incomeStatement.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
              ) : (
                <div className="overflow-x-auto">
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
                      {(
                        [
                          { key: "revenue", label: "매출액" },
                          { key: "netIncome", label: "순이익" },
                          { key: "ebitda", label: "EBITDA" },
                          { key: "eps", label: "EPS" },
                        ] as const
                      ).map(({ key, label }) => (
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
              )}
            </TabsContent>

            <TabsContent value="balance">
              {data.balanceSheet.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
              ) : (
                <div className="overflow-x-auto">
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
                      {(
                        [
                          { key: "totalAssets", label: "총자산" },
                          { key: "totalDebt", label: "총부채" },
                          { key: "cash", label: "현금성자산" },
                          { key: "stockholdersEquity", label: "자기자본" },
                        ] as const
                      ).map(({ key, label }) => (
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
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 기업 정보 */}
      {(data.sector || data.industry || data.description) && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">기업 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
