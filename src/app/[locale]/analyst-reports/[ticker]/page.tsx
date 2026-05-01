"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, TrendingDown, Minus, ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalystReportsTickerResponse, ReportItem } from "@/app/api/analyst-reports/[ticker]/route";

function fmtNum(n: number | null, digits = 0): string {
  if (n === null || !isFinite(n)) return "—";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtPct(n: number | null): string {
  if (n === null || !isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function RecommendationBadge({ rec, normalized }: { rec: string | null; normalized: string | null }) {
  if (!rec && !normalized) return <span className="text-xs text-muted-foreground">—</span>;
  const n = normalized ?? "";
  const color =
    n === "STRONG_BUY" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" :
    n === "BUY" || n === "OUTPERFORM" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" :
    n === "HOLD" ? "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300" :
    n === "SELL" || n === "REDUCE" || n === "UNDERPERFORM" ? "bg-red-500/20 text-red-700 dark:text-red-300" :
    "bg-muted text-muted-foreground";
  return <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", color)}>{rec ?? n}</span>;
}

export default function AnalystReportsTickerPage({ params }: { params: Promise<{ ticker: string; locale: string }> }) {
  const { ticker } = use(params);
  const [data, setData] = useState<AnalystReportsTickerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analyst-reports/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then((d: AnalystReportsTickerResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-muted/40 animate-pulse" />
        <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
        <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (!data || data.reports.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/analyst-reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 리포트 목록
        </Link>
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {ticker}에 대한 리포트가 없습니다.
        </p>
      </div>
    );
  }

  // Chart data — 가격 + 목표가 점들
  const chartData = data.price_history.map(p => ({ date: p.date, price: p.price }));
  const targetPoints = data.reports
    .filter(r => r.target_price_num !== null && r.report_date)
    .map(r => ({ date: r.report_date, target: r.target_price_num!, firm: r.firm ?? "?" }));

  return (
    <div className="space-y-5">
      <Link href="/analyst-reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 리포트 목록
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{data.stock_name}</h1>
            <span className="font-mono text-sm text-muted-foreground">{data.ticker}</span>
            {data.market && <Badge variant="outline" className="text-[10px]">{data.market}</Badge>}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            리포트 {data.reports.length}건 · 증권사 {data.firm_summary.length}곳 · 애널리스트 {data.analyst_summary.length}명
          </div>
        </div>
        {data.current_price !== null && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">현재가</div>
            <div className="text-2xl font-bold tabular-nums">₩{fmtNum(data.current_price)}</div>
            <div className="text-[11px] text-muted-foreground">{data.current_price_date}</div>
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">주가 추이 + 목표가</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtNum(Number(v))} width={70} />
                <Tooltip
                  formatter={(value) => `₩${fmtNum(Number(value))}`}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Scatter data={targetPoints.map(p => ({ date: p.date, target: p.target }))} dataKey="target" fill="#f59e0b" />
                <ZAxis range={[60, 60]} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span><span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />실제 주가</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-1" />증권사 목표가</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Firm summary */}
      {data.firm_summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">증권사별 요약</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-1.5 text-left font-medium">증권사</th>
                  <th className="pb-1.5 text-right font-medium">건수</th>
                  <th className="pb-1.5 text-right font-medium">평균 목표가</th>
                  <th className="pb-1.5 text-right font-medium">발행 후 수익률</th>
                  <th className="pb-1.5 text-right font-medium">12M 도달률</th>
                </tr>
              </thead>
              <tbody>
                {data.firm_summary.map((f) => (
                  <tr key={f.firm} className="border-b border-border/40 last:border-b-0">
                    <td className="py-1.5">{f.firm}</td>
                    <td className="py-1.5 text-right tabular-nums">{f.count}</td>
                    <td className="py-1.5 text-right tabular-nums">₩{fmtNum(f.avg_target)}</td>
                    <td className={cn("py-1.5 text-right tabular-nums",
                      f.avg_return_since_pct > 0 && "text-emerald-600 dark:text-emerald-400",
                      f.avg_return_since_pct < 0 && "text-red-600 dark:text-red-400")}>
                      {fmtPct(f.avg_return_since_pct)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {f.hit_rate_12m !== null ? `${f.hit_rate_12m.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Reports table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">리포트 이력</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="pb-1.5 text-left font-medium">발행일</th>
                <th className="pb-1.5 text-left font-medium">증권사 / 애널</th>
                <th className="pb-1.5 text-left font-medium">추천</th>
                <th className="pb-1.5 text-right font-medium">목표가</th>
                <th className="pb-1.5 text-right font-medium">발행일 종가</th>
                <th className="pb-1.5 text-right font-medium">발행 시 upside</th>
                <th className="pb-1.5 text-right font-medium">수익률 (지금까지)</th>
                <th className="pb-1.5 text-center font-medium">12M 도달</th>
                <th className="pb-1.5 text-left font-medium">제목</th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r: ReportItem) => (
                <tr key={r.id} className="border-b border-border/40 last:border-b-0 align-top">
                  <td className="py-1.5 font-mono text-[11px] whitespace-nowrap">{r.report_date.slice(0, 10)}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {r.firm ?? "—"}
                    </div>
                    {r.analyst && <div className="text-[10px] text-muted-foreground mt-0.5">{r.analyst}</div>}
                  </td>
                  <td className="py-1.5"><RecommendationBadge rec={r.recommendation} normalized={r.recommendation_normalized} /></td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{r.target_price_num ? `₩${fmtNum(r.target_price_num)}` : "—"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{r.price_at_report ? `₩${fmtNum(r.price_at_report)}` : "—"}</td>
                  <td className={cn("py-1.5 text-right tabular-nums font-mono",
                    r.target_upside_at_report_pct !== null && r.target_upside_at_report_pct > 0 && "text-emerald-600 dark:text-emerald-400",
                    r.target_upside_at_report_pct !== null && r.target_upside_at_report_pct < 0 && "text-red-600 dark:text-red-400")}>
                    {fmtPct(r.target_upside_at_report_pct)}
                  </td>
                  <td className={cn("py-1.5 text-right tabular-nums font-mono",
                    r.return_since_pct !== null && r.return_since_pct > 0 && "text-emerald-600 dark:text-emerald-400",
                    r.return_since_pct !== null && r.return_since_pct < 0 && "text-red-600 dark:text-red-400")}>
                    <span className="inline-flex items-center gap-0.5 justify-end">
                      {r.return_since_pct !== null && r.return_since_pct > 0 && <TrendingUp className="h-3 w-3" />}
                      {r.return_since_pct !== null && r.return_since_pct < 0 && <TrendingDown className="h-3 w-3" />}
                      {fmtPct(r.return_since_pct)}
                    </span>
                  </td>
                  <td className="py-1.5 text-center">
                    {r.hit_target_within_12m === true ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">
                        ✓ {r.days_to_hit}일
                      </span>
                    ) : r.hit_target_within_12m === false ? (
                      <Minus className="mx-auto h-3 w-3 text-muted-foreground" />
                    ) : "—"}
                  </td>
                  <td className="py-1.5 text-[11px] max-w-md">
                    <div className="flex items-start gap-1">
                      <span className="line-clamp-2">{r.title}</span>
                      {r.pdf_url && (
                        <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.reports.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto h-6 w-6 opacity-30 mb-1" />
              리포트 없음
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
