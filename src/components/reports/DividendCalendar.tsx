"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDividendSchedule, useExchangeRate } from "@/hooks/use-api";
import { usePrivacy } from "@/contexts/privacy-context";
import { formatKRW, formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

const MASK = "•••••";

export function DividendCalendar() {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { isPrivate } = usePrivacy();
  const { data, isLoading } = useDividendSchedule();
  const { data: exchangeRateData } = useExchangeRate();
  const exchangeRate = exchangeRateData?.rate ?? 1350;
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");

  const monthLabels = locale === "ko"
    ? ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const frequencyLabel = (freq: string) => {
    const map: Record<string, string> = {
      annual: t("frequencyAnnual"),
      quarterly: t("frequencyQuarterly"),
      monthly: t("frequencyMonthly"),
    };
    return map[freq] ?? freq;
  };

  const formatValue = (krw: number) => {
    if (currency === "USD") return formatUSD(krw / exchangeRate);
    return formatKRW(krw);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dividendCalendar")}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("loading")}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dividendCalendar")}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          {t("noDividendData")}
        </CardContent>
      </Card>
    );
  }

  const chartData = data.monthly.map((m) => ({
    month: monthLabels[m.month - 1],
    amount: currency === "USD" ? Math.round(m.amount_krw / exchangeRate) : m.amount_krw,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>{t("dividendCalendar")}</CardTitle>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {t("totalDividend")}:{" "}
            <span className="font-bold font-mono text-foreground">
              {isPrivate ? MASK : formatValue(data.total_annual_krw)}
            </span>
            <span className="text-xs ml-1">/ {locale === "ko" ? "년" : "yr"}</span>
          </div>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["KRW", "USD"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur)}
                className={cn(
                  "px-3 py-1 font-medium transition-colors",
                  currency === cur
                    ? "bg-emerald-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis
              tickFormatter={(v) =>
                currency === "USD" ? `$${v}` : formatKRW(v)
              }
              className="text-xs"
              width={70}
            />
            <Tooltip
              formatter={(value) => [
                currency === "USD" ? formatUSD(value as number) : formatKRW(value as number),
                t("monthlyDividend"),
              ]}
            />
            <Bar
              dataKey="amount"
              name={t("monthlyDividend")}
              fill="#10b981"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ticker")}</TableHead>
                <TableHead>{t("frequency")}</TableHead>
                <TableHead>{t("exDividendDate")}</TableHead>
                <TableHead className="text-right">{t("perShare")}</TableHead>
                <TableHead className="text-right">{t("annualIncome")}</TableHead>
                <TableHead>{t("paymentMonths")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.ticker}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.ticker} · {item.quantity.toLocaleString()}
                      {locale === "ko" ? "주" : " shares"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {frequencyLabel(item.frequency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.ex_dividend_date ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {isPrivate ? MASK : item.per_share_amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-emerald-600">
                    {isPrivate ? MASK : formatValue(item.annual_income_krw)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.payment_months
                      .map((m) => monthLabels[m - 1])
                      .join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
