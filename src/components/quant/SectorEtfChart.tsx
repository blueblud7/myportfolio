"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSectorEtf } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLV: "Health Care",
  XLE: "Energy",
  XLI: "Industrials",
  XLY: "Consumer Disc.",
  XLP: "Consumer Staples",
  XLRE: "Real Estate",
  XLU: "Utilities",
  XLB: "Materials",
  XLC: "Communication",
};

const SECTOR_COLORS: Record<string, string> = {
  XLK: "#3b82f6",
  XLF: "#10b981",
  XLV: "#f59e0b",
  XLE: "#ef4444",
  XLI: "#8b5cf6",
  XLY: "#ec4899",
  XLP: "#06b6d4",
  XLRE: "#84cc16",
  XLU: "#f97316",
  XLB: "#6366f1",
  XLC: "#14b8a6",
};

const PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y"];

function formatPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function SectorEtfChart() {
  const t = useTranslations("Quant");
  const [period, setPeriod] = useState("3M");
  const [hiddenSectors, setHiddenSectors] = useState<Set<string>>(new Set());

  const { data, isLoading } = useSectorEtf(period);

  const toggleSector = (ticker: string) => {
    setHiddenSectors((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  // Merge all dates into single chart data
  const chartData = (() => {
    if (!data) return [];
    const dateMap = new Map<string, Record<string, number>>();
    for (const [ticker, pts] of Object.entries(data)) {
      for (const pt of pts) {
        if (!dateMap.has(pt.date)) dateMap.set(pt.date, {});
        dateMap.get(pt.date)![ticker] = pt.return_pct;
      }
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  })();

  // Table: sector performance sorted by period return
  const tableRows = Object.keys(SECTOR_ETFS)
    .map((ticker) => {
      const pts = data?.[ticker] ?? [];
      const periodReturn = pts.at(-1)?.return_pct ?? null;
      return { ticker, name: SECTOR_ETFS[ticker], periodReturn };
    })
    .sort((a, b) => (b.periodReturn ?? -Infinity) - (a.periodReturn ?? -Infinity));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>{t("sectorEtf")}</CardTitle>
          <div className="flex rounded-md border overflow-hidden text-sm">
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
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            로딩 중...
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={320}>
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
                  formatter={(v: number | undefined, name: string | undefined) => [v != null ? formatPct(v) : "", name ? `${name} – ${SECTOR_ETFS[name] ?? name}` : ""]}
                  labelFormatter={(l) => l}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: 11,
                  }}
                />
                <Legend
                  onClick={(e) => toggleSector(e.dataKey as string)}
                  formatter={(value) => SECTOR_ETFS[value] ?? value}
                  wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                />
                {Object.keys(SECTOR_ETFS).map((ticker) => (
                  <Line
                    key={ticker}
                    type="monotone"
                    dataKey={ticker}
                    stroke={SECTOR_COLORS[ticker]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    hide={hiddenSectors.has(ticker)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            {/* Summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left font-medium">섹터</th>
                    <th className="py-2 text-left font-medium">ETF</th>
                    <th className="py-2 text-right font-medium">기간 수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.ticker} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: SECTOR_COLORS[row.ticker] }}
                          />
                          {row.name}
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground">{row.ticker}</td>
                      <td
                        className={cn(
                          "py-2 text-right font-mono font-medium",
                          row.periodReturn === null
                            ? "text-muted-foreground"
                            : row.periodReturn >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        )}
                      >
                        {row.periodReturn !== null ? formatPct(row.periodReturn) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
