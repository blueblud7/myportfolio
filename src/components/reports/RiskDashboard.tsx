"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRiskMetrics } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import type { RiskPeriod } from "@/types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const PERIODS: RiskPeriod[] = ["1M", "3M", "6M", "1Y", "ALL"];

function MetricCard({
  label,
  value,
  sub,
  colorClass,
  description,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold font-mono", colorClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {description && <div className="mt-1 text-xs text-muted-foreground/70">{description}</div>}
      </CardContent>
    </Card>
  );
}

function sharpeColor(s: number) {
  if (s >= 1) return "text-emerald-600";
  if (s >= 0) return "text-yellow-600";
  return "text-red-500";
}

function volatilityColor(v: number) {
  if (v < 10) return "text-emerald-600";
  if (v < 20) return "text-yellow-600";
  return "text-red-500";
}

export function RiskDashboard() {
  const t = useTranslations("Risk");
  const [period, setPeriod] = useState<RiskPeriod>("1Y");
  const { data, isLoading } = useRiskMetrics(period);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PeriodSelector period={period} onSelect={setPeriod} />
        <div className="py-16 text-center text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!data || data.data_points < 2) {
    return (
      <div className="space-y-4">
        <PeriodSelector period={period} onSelect={setPeriod} />
        <div className="py-16 text-center text-muted-foreground">{t("noData")}</div>
      </div>
    );
  }

  const returnColor = data.period_return >= 0 ? "text-emerald-600" : "text-red-500";
  const mddColor = data.mdd < -20 ? "text-red-500" : data.mdd < -10 ? "text-yellow-600" : "text-emerald-600";

  return (
    <div className="space-y-6">
      <PeriodSelector period={period} onSelect={setPeriod} />

      {/* 지표 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={t("periodReturn")}
          value={formatPercent(data.period_return)}
          colorClass={returnColor}
          description={t("periodReturnDesc")}
        />
        <MetricCard
          label={t("volatility")}
          value={`${data.volatility.toFixed(1)}%`}
          sub={t("annualized")}
          colorClass={volatilityColor(data.volatility)}
          description={t("volatilityDesc")}
        />
        <MetricCard
          label={t("mdd")}
          value={formatPercent(data.mdd)}
          colorClass={mddColor}
          description={t("mddDesc")}
        />
        <MetricCard
          label={t("sharpe")}
          value={data.sharpe.toFixed(2)}
          sub="Rf = 3.5%"
          colorClass={sharpeColor(data.sharpe)}
          description={t("sharpeDesc")}
        />
        <MetricCard
          label={t("bestDay")}
          value={formatPercent(data.best_day)}
          colorClass="text-emerald-600"
        />
        <MetricCard
          label={t("worstDay")}
          value={formatPercent(data.worst_day)}
          colorClass="text-red-500"
        />
      </div>

      {/* 샤프 비율 해석 배너 */}
      <SharpeInterpretation sharpe={data.sharpe} t={t} />

      {/* 낙폭 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("drawdownChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.drawdown_series} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                domain={["auto", 0]}
                width={48}
              />
              <Tooltip
                formatter={(val) => [`${(val as number).toFixed(2)}%`, t("drawdown")]}
                labelFormatter={(l) => l}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Area
                type="monotone"
                dataKey="drawdown_pct"
                stroke="#ef4444"
                fill="#ef444420"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 일별 수익률 분포 차트 */}
      {data.daily_returns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dailyReturnsChart")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("positiveDays", { pct: data.positive_days_pct.toFixed(1) })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.daily_returns} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  width={48}
                />
                <Tooltip
                  formatter={(val) => [`${(val as number).toFixed(2)}%`, t("dailyReturn")]}
                  labelFormatter={(l) => l}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="return_pct" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {data.daily_returns.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.return_pct >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PeriodSelector({
  period,
  onSelect,
}: {
  period: RiskPeriod;
  onSelect: (p: RiskPeriod) => void;
}) {
  const t = useTranslations("Risk");
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            period === p
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {p === "ALL" ? t("all") : p}
        </button>
      ))}
    </div>
  );
}

function SharpeInterpretation({
  sharpe,
  t,
}: {
  sharpe: number;
  t: ReturnType<typeof useTranslations<"Risk">>;
}) {
  let level: "good" | "ok" | "poor";
  let bgClass: string;
  if (sharpe >= 1) {
    level = "good";
    bgClass = "bg-emerald-50 border-emerald-200 text-emerald-800";
  } else if (sharpe >= 0) {
    level = "ok";
    bgClass = "bg-yellow-50 border-yellow-200 text-yellow-800";
  } else {
    level = "poor";
    bgClass = "bg-red-50 border-red-200 text-red-800";
  }

  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", bgClass)}>
      <span className="font-semibold">{t("sharpe")}: {sharpe.toFixed(2)}</span>
      {"  "}
      {t(`sharpe_${level}`)}
    </div>
  );
}
