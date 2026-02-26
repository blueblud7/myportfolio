"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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
import { subDays, format } from "date-fns";
import { formatKRW } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TotalAssetChart() {
  const t = useTranslations("TotalAssetChart");
  const [period, setPeriod] = useState<string>("3M");

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
        <CardTitle>{t("title")}</CardTitle>
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
        )}
      </CardContent>
    </Card>
  );
}
