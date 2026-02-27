"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useSnapshots, useBenchmarks } from "@/hooks/use-api";
import { subDays, format } from "date-fns";
import { formatKRW } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChartMode = "absolute" | "return";

const BENCHMARK_COLORS: Record<string, string> = {
  KOSPI: "#ef4444",
  "S&P500": "#3b82f6",
  NASDAQ: "#22c55e",
};

export function TotalAssetChart() {
  const t = useTranslations("TotalAssetChart");
  const [period, setPeriod] = useState<string>("3M");
  const [mode, setMode] = useState<ChartMode>("absolute");
  const [enabledBenchmarks, setEnabledBenchmarks] = useState<Record<string, boolean>>({
    KOSPI: true,
    "S&P500": true,
    NASDAQ: false,
  });

  const periods = [
    { key: "1W", label: t("1w"), days: 7 },
    { key: "1M", label: t("1m"), days: 30 },
    { key: "3M", label: t("3m"), days: 90 },
    { key: "6M", label: t("6m"), days: 180 },
    { key: "1Y", label: t("1y"), days: 365 },
    { key: "ALL", label: t("all"), days: 0 },
  ] as const;

  const { start, end } = useMemo(() => {
    const now = new Date();
    const p = periods.find((p) => p.key === period);
    if (!p || p.days === 0) return { start: undefined, end: undefined };
    const startDate = format(subDays(now, p.days), "yyyy-MM-dd");
    return { start: startDate, end: format(now, "yyyy-MM-dd") };
  }, [period, periods]);

  const { data: snapshots } = useSnapshots(start, end);
  const { data: benchmarks } = useBenchmarks(
    mode === "return" ? start : undefined,
    mode === "return" ? end : undefined
  );

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    return snapshots.map((s) => ({
      date: s.date,
      total: Math.round(s.total_krw),
      stock: Math.round(s.stock_krw),
      bank: Math.round(s.bank_krw),
    }));
  }, [snapshots]);

  const returnData = useMemo(() => {
    if (mode !== "return" || !snapshots || snapshots.length === 0) return [];

    const baseValue = snapshots[0].total_krw;
    if (baseValue === 0) return [];

    // Build a date-indexed map for benchmarks
    const benchmarkByDate: Record<string, Record<string, number>> = {};
    if (benchmarks) {
      for (const [name, points] of Object.entries(benchmarks)) {
        if (!points || points.length === 0) continue;
        const baseClose = points[0].close;
        if (baseClose === 0) continue;
        for (const p of points) {
          if (!benchmarkByDate[p.date]) benchmarkByDate[p.date] = {};
          benchmarkByDate[p.date][name] = ((p.close - baseClose) / baseClose) * 100;
        }
      }
    }

    return snapshots.map((s) => {
      const point: Record<string, string | number> = {
        date: s.date,
        portfolio: Number((((s.total_krw - baseValue) / baseValue) * 100).toFixed(2)),
      };
      // Add benchmark values for this date
      const bm = benchmarkByDate[s.date];
      if (bm) {
        for (const [name, val] of Object.entries(bm)) {
          point[name] = Number(val.toFixed(2));
        }
      }
      return point;
    });
  }, [mode, snapshots, benchmarks]);

  const toggleBenchmark = (name: string) => {
    setEnabledBenchmarks((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              onClick={() => setMode("absolute")}
              className={cn(
                "px-3 py-1 font-medium transition-colors text-xs",
                mode === "absolute"
                  ? "bg-indigo-500 text-white"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {t("absolute")}
            </button>
            <button
              onClick={() => setMode("return")}
              className={cn(
                "px-3 py-1 font-medium transition-colors text-xs",
                mode === "return"
                  ? "bg-indigo-500 text-white"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {t("return")}
            </button>
          </div>
          <div className="flex gap-1">
            {periods.map((p) => (
              <Button
                key={p.key}
                variant={period === p.key ? "default" : "ghost"}
                size="sm"
                className={cn("h-7 px-2 text-xs")}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "absolute" ? (
          // Absolute value mode (existing AreaChart)
          chartData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(new Date(v), "MM/dd")}
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v) => formatKRW(v)}
                  className="text-xs"
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [formatKRW(value as number), ""]}
                  labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd")}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  name={t("totalAssets")}
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="stock"
                  name={t("stock")}
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="bank"
                  name={t("bank")}
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : (
          // Return % mode (LineChart with benchmarks)
          returnData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={returnData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => format(new Date(v as string), "MM/dd")}
                    className="text-xs"
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    className="text-xs"
                    width={60}
                  />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(2)}%`, ""]}
                    labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd")}
                  />
                  <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name={t("portfolio")}
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  {Object.entries(BENCHMARK_COLORS).map(
                    ([name, color]) =>
                      enabledBenchmarks[name] && (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          name={name}
                          stroke={color}
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                      )
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-4 justify-center">
                {Object.entries(BENCHMARK_COLORS).map(([name, color]) => (
                  <label
                    key={name}
                    className="flex items-center gap-1.5 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={enabledBenchmarks[name] ?? false}
                      onChange={() => toggleBenchmark(name)}
                      className="rounded"
                      style={{ accentColor: color }}
                    />
                    <span
                      className="w-3 h-0.5 inline-block rounded"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-muted-foreground">{name}</span>
                  </label>
                ))}
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
