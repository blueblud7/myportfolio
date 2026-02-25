"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSnapshots } from "@/hooks/use-api";
import { subDays, subMonths, subYears, format } from "date-fns";
import { formatKRW } from "@/lib/format";
import { cn } from "@/lib/utils";

const periods = [
  { key: "1W", label: "1주", days: 7 },
  { key: "1M", label: "1달", days: 30 },
  { key: "3M", label: "3달", days: 90 },
  { key: "6M", label: "6달", days: 180 },
  { key: "1Y", label: "1년", days: 365 },
  { key: "ALL", label: "전체", days: 0 },
] as const;

export function TotalAssetChart() {
  const [period, setPeriod] = useState<string>("3M");

  const { start, end } = useMemo(() => {
    const now = new Date();
    const p = periods.find((p) => p.key === period);
    if (!p || p.days === 0) return { start: undefined, end: undefined };
    const startDate = p.days <= 365
      ? format(subDays(now, p.days), "yyyy-MM-dd")
      : format(subYears(now, 3), "yyyy-MM-dd");
    return { start: startDate, end: format(now, "yyyy-MM-dd") };
  }, [period]);

  const { data: snapshots } = useSnapshots(start, end);

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    return snapshots.map((s) => ({
      date: s.date,
      total: Math.round(s.total_krw),
      stock: Math.round(s.stock_krw),
      bank: Math.round(s.bank_krw),
    }));
  }, [snapshots]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>총자산 추이</CardTitle>
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
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            스냅샷 데이터가 없습니다. 대시보드 접속시 자동으로 생성됩니다.
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
                name="총자산"
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.1}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="stock"
                name="주식"
                stroke="hsl(var(--chart-2))"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.05}
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="bank"
                name="은행"
                stroke="hsl(var(--chart-3))"
                fill="hsl(var(--chart-3))"
                fillOpacity={0.05}
                strokeWidth={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
