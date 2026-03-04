"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePerformanceCompare, useAccounts, useHoldings } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { PerformancePeriod, PerformanceSubjectType } from "@/types";

const PERIODS: PerformancePeriod[] = ["1M", "3M", "6M", "1Y"];

const BENCHMARKS = ["KOSPI", "S&P500", "NASDAQ100", "NASDAQ"];

const SUBJECT_COLOR = "#10b981";
const BENCHMARK_COLORS: Record<string, string> = {
  KOSPI: "#f59e0b",
  "S&P500": "#3b82f6",
  NASDAQ100: "#a855f7",
  NASDAQ: "#06b6d4",
};

function formatPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

interface BenchmarkComparisonProps {
  /** 계좌 상세 등에서 계좌를 고정할 때 사용 — 지정 시 subject 선택 UI 숨김 */
  fixedAccountId?: number;
}

export function BenchmarkComparison({ fixedAccountId }: BenchmarkComparisonProps = {}) {
  const t = useTranslations("Reports");
  const [subjectType, setSubjectType] = useState<PerformanceSubjectType>(
    fixedAccountId ? "account" : "portfolio"
  );
  const [accountId, setAccountId] = useState<string>(
    fixedAccountId ? String(fixedAccountId) : ""
  );
  const [stockTicker, setStockTicker] = useState<string>("");
  const [period, setPeriod] = useState<PerformancePeriod>("3M");
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>(["KOSPI", "S&P500"]);

  const { data: accounts } = useAccounts();
  const { data: allHoldings } = useHoldings();

  const subjectId =
    subjectType === "account" ? accountId : subjectType === "stock" ? stockTicker : undefined;

  const validSubject =
    subjectType === "portfolio" ||
    (subjectType === "account" && !!accountId) ||
    (subjectType === "stock" && !!stockTicker);

  const { data, isLoading } = usePerformanceCompare({
    type: subjectType,
    id: subjectId,
    period,
    benchmarks: selectedBenchmarks,
  });

  const toggleBenchmark = (name: string) => {
    setSelectedBenchmarks((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]
    );
  };

  // Merge all data points into a single date-indexed series for recharts
  const chartData = (() => {
    if (!data) return [];
    const dateMap = new Map<string, Record<string, number>>();

    for (const pt of data.subject.points) {
      if (!dateMap.has(pt.date)) dateMap.set(pt.date, {});
      dateMap.get(pt.date)!["subject"] = pt.return_pct;
    }
    for (const [name, pts] of Object.entries(data.benchmarks)) {
      for (const pt of pts) {
        if (!dateMap.has(pt.date)) dateMap.set(pt.date, {});
        dateMap.get(pt.date)![name] = pt.return_pct;
      }
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  })();

  // Summary — 기간 내 변화량 (끝 - 시작)
  const subjectStart = data?.subject.points.at(0)?.return_pct ?? 0;
  const subjectLast = data?.subject.points.at(-1)?.return_pct ?? null;
  const subjectPeriodChange = subjectLast !== null ? subjectLast - subjectStart : null;

  const uniqueHoldings = allHoldings
    ? Array.from(new Map((allHoldings as { ticker: string; name: string }[]).map((h) => [h.ticker, h])).values())
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("benchmarkComparison")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subject selector — fixedAccountId 지정 시 숨김 */}
        <div className="flex flex-wrap items-center gap-2">
          {!fixedAccountId && (
            <>
              <div className="flex rounded-md border overflow-hidden text-sm">
                {(["portfolio", "account", "stock"] as PerformanceSubjectType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSubjectType(s)}
                    className={cn(
                      "px-3 py-1.5 font-medium transition-colors",
                      subjectType === s
                        ? "bg-emerald-500 text-white"
                        : "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s === "portfolio"
                      ? t("subjectPortfolio")
                      : s === "account"
                      ? t("subjectAccount")
                      : t("subjectStock")}
                  </button>
                ))}
              </div>

              {subjectType === "account" && (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">계좌 선택...</option>
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}

              {subjectType === "stock" && (
                <select
                  value={stockTicker}
                  onChange={(e) => setStockTicker(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">종목 선택...</option>
                  {uniqueHoldings.map((h) => (
                    <option key={h.ticker} value={h.ticker}>
                      {h.name} ({h.ticker})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* Period selector */}
          <div className={cn("flex rounded-md border overflow-hidden text-sm", !fixedAccountId && "ml-auto")}>
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  period === p
                    ? "bg-blue-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark toggles */}
        <div className="flex flex-wrap gap-2">
          {BENCHMARKS.map((b) => (
            <button
              key={b}
              onClick={() => toggleBenchmark(b)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selectedBenchmarks.includes(b)
                  ? "border-transparent text-white"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
              style={
                selectedBenchmarks.includes(b)
                  ? { backgroundColor: BENCHMARK_COLORS[b] }
                  : {}
              }
            >
              {b}
            </button>
          ))}
        </div>

        {/* Chart */}
        {!validSubject ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            계좌 또는 종목을 선택해주세요
          </div>
        ) : isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            로딩 중...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => d.substring(5)}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                formatter={(v: number | undefined, name: string | undefined) => [
                  v != null ? formatPct(v) : "",
                  !name ? "" : name === "subject" ? data?.subject.name ?? "포트폴리오" : name,
                ]}
                labelFormatter={(l) => l}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: 12,
                }}
              />
              <Legend
                formatter={(value) =>
                  value === "subject" ? data?.subject.name ?? "포트폴리오" : value
                }
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
              <Line
                type="monotone"
                dataKey="subject"
                stroke={SUBJECT_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              {selectedBenchmarks.map((b) => (
                <Line
                  key={b}
                  type="monotone"
                  dataKey={b}
                  stroke={BENCHMARK_COLORS[b]}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Summary */}
        {data && validSubject && subjectLast !== null && subjectPeriodChange !== null && (
          <div className="space-y-2 rounded-lg bg-muted/40 px-4 py-3 text-sm">
            {/* 현재 총 손익 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">총 손익 (원가 대비)</span>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SUBJECT_COLOR }}
                />
                <span className="font-medium">{data.subject.name}</span>
                <span className={cn("font-mono font-semibold", subjectLast >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {formatPct(subjectLast)}
                </span>
              </div>
            </div>
            {/* 기간 내 변화량 + 초과 수익 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-muted pt-2">
              <span className="text-xs text-muted-foreground">기간 변화 ({period})</span>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SUBJECT_COLOR }} />
                <span className="font-medium">{data.subject.name}</span>
                <span className={cn("font-mono font-semibold", subjectPeriodChange >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {formatPct(subjectPeriodChange)}
                </span>
              </div>
              {selectedBenchmarks.map((b) => {
                const pts = data.benchmarks[b];
                const bStart = pts?.at(0)?.return_pct ?? 0;
                const bLast = pts?.at(-1)?.return_pct ?? null;
                if (bLast === null) return null;
                const bPeriodChange = bLast - bStart;
                const excess = subjectPeriodChange - bPeriodChange;
                return (
                  <div key={b} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BENCHMARK_COLORS[b] }} />
                    <span className="text-muted-foreground">{b}</span>
                    <span className={cn("font-mono", bPeriodChange >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {formatPct(bPeriodChange)}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{t("excessReturn")}</span>
                    <span className={cn("font-mono font-semibold", excess >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {formatPct(excess)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
