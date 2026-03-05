"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { subMonths, subYears } from "date-fns";
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
import { useAccountSnapshots } from "@/hooks/use-api";
import { todayPST, formatPST } from "@/lib/tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Period = "1M" | "3M" | "6M" | "1Y" | "ALL";

const PERIOD_BUTTONS: Period[] = ["1M", "3M", "6M", "1Y", "ALL"];

const LINE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function periodToStart(period: Period): string | undefined {
  const now = new Date();
  if (period === "1M") return formatPST(subMonths(now, 1));
  if (period === "3M") return formatPST(subMonths(now, 3));
  if (period === "6M") return formatPST(subMonths(now, 6));
  if (period === "1Y") return formatPST(subYears(now, 1));
  return undefined;
}

function formatKrw(value: number) {
  if (Math.abs(value) >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}억`;
  }
  if (Math.abs(value) >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}만`;
  }
  return value.toLocaleString("ko-KR");
}

interface Props {
  currency: "KRW" | "USD";
  exchangeRate: number;
}

export function AccountTrendChart({ currency, exchangeRate }: Props) {
  const t = useTranslations("AccountTrendChart");
  const [period, setPeriod] = useState<Period>("3M");
  const start = periodToStart(period);
  const end = todayPST();

  const { data: rawSnapshots, mutate } = useAccountSnapshots(start, end);

  // 계좌 페이지 방문 시 오늘 스냅샷을 최신 가격으로 생성/업데이트
  useEffect(() => {
    fetch("/api/snapshots", { method: "POST" })
      .then(() => mutate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { chartData, accountNames } = useMemo(() => {
    if (!rawSnapshots || rawSnapshots.length === 0) {
      return { chartData: [], accountNames: [] };
    }

    const names = [...new Set(rawSnapshots.map((s) => s.name))];
    const dateMap: Record<string, Record<string, number>> = {};

    for (const snap of rawSnapshots) {
      if (!dateMap[snap.date]) dateMap[snap.date] = {};
      const val = currency === "USD" ? snap.value_krw / exchangeRate : snap.value_krw;
      dateMap[snap.date][snap.name] = val;
    }

    const sorted = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));

    return { chartData: sorted, accountNames: names };
  }, [rawSnapshots, currency, exchangeRate]);

  if (!rawSnapshots || rawSnapshots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("noData")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <div className="flex gap-1">
          {PERIOD_BUTTONS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "ghost"}
              className={cn("h-7 px-2.5 text-xs", period !== p && "text-muted-foreground")}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={formatKrw}
              width={60}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                value == null
                  ? "—"
                  : currency === "USD"
                  ? `$${(value as number).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  : `₩${(value as number).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`,
                name as string,
              ]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                fontSize: 12,
                borderRadius: "0.5rem",
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {accountNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
