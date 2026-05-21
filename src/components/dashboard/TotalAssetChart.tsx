"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">{t("title")}</h3>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="seg seg-sm">
            <button className={`seg-btn${mode === "absolute" ? " active" : ""}`} onClick={() => setMode("absolute")}>{t("absolute")}</button>
            <button className={`seg-btn${mode === "return" ? " active" : ""}`} onClick={() => setMode("return")}>{t("return")}</button>
          </div>
          <div className="seg seg-sm">
            {periods.map((p) => (
              <button key={p.key} className={`seg-btn${period === p.key ? " active" : ""}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-body card-body-padded">
        {mode === "absolute" ? (
          chartData.length === 0 ? (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", fontSize: 13 }}>{t("noData")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
                <YAxis tickFormatter={(v) => formatKRW(v)} width={80} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
                <Tooltip formatter={(value) => [formatKRW(value as number), ""]} labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="total"  name={t("totalAssets")} stroke="var(--accent)"  fill="var(--accent)"  fillOpacity={0.12} strokeWidth={1.8} />
                <Area type="monotone" dataKey="stock"  name={t("stock")}       stroke="var(--up)"     fill="var(--up)"     fillOpacity={0.07} strokeWidth={1.2} />
                <Area type="monotone" dataKey="bank"   name={t("bank")}        stroke="var(--warn)"   fill="var(--warn)"   fillOpacity={0.07} strokeWidth={1.2} />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : (
          returnData.length === 0 ? (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", fontSize: 13 }}>{t("noData")}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={returnData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v as string), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
                  <YAxis tickFormatter={(v) => `${v}%`} width={60} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, ""]} labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="portfolio" name={t("portfolio")} stroke="var(--accent)" strokeWidth={2} dot={false} />
                  {Object.entries(BENCHMARK_COLORS).map(([name, color]) =>
                    enabledBenchmarks[name] && (
                      <Line key={name} type="monotone" dataKey={name} name={name} stroke={color} strokeWidth={1.5} dot={false} connectNulls />
                    )
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
                {Object.entries(BENCHMARK_COLORS).map(([name, color]) => (
                  <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "var(--fg-3)" }}>
                    <input type="checkbox" checked={enabledBenchmarks[name] ?? false} onChange={() => toggleBenchmark(name)} style={{ accentColor: color }} />
                    <span style={{ width: 12, height: 2, background: color, display: "inline-block", borderRadius: 1 }} />
                    {name}
                  </label>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
