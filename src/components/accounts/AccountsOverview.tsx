"use client";

import { useMemo } from "react";
import { useHoldings, useExchangeRate, useReports } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { formatKRW, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, BarChart2 } from "lucide-react";

export function AccountsOverview() {
  const { data: holdings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const { data: reports } = useReports();
  const exchangeRate = exchangeRateData?.rate ?? 1350;

  const summary = useMemo(() => {
    if (!Array.isArray(holdings)) return { totalKrw: 0, costKrw: 0, gainLossKrw: 0, gainLossPct: 0 };

    let totalKrw = 0;
    let costKrw = 0;

    for (const h of holdings as {
      ticker: string; quantity: number; avg_cost: number;
      current_price: number; currency: string;
    }[]) {
      const price = h.ticker === "CASH" ? h.avg_cost : (h.current_price || h.avg_cost);
      const value = h.quantity * price;
      const cost = h.quantity * h.avg_cost;
      const mul = h.currency === "USD" ? exchangeRate : 1;
      totalKrw += value * mul;
      if (h.ticker !== "CASH") costKrw += cost * mul;
      else costKrw += value * mul;
    }

    const gainLossKrw = totalKrw - costKrw;
    const gainLossPct = costKrw > 0 ? (gainLossKrw / costKrw) * 100 : 0;
    return { totalKrw, costKrw, gainLossKrw, gainLossPct };
  }, [holdings, exchangeRate]);

  const allocationData = useMemo(() => {
    if (!reports?.by_account) return [];
    return reports.by_account
      .filter((a) => a.value_krw > 0)
      .map((a) => ({ name: a.name, value: a.value_krw }));
  }, [reports]);

  const topPerformers = reports?.top_performers ?? [];
  const worstPerformers = reports?.worst_performers ?? [];

  return (
    <div className="space-y-4">
      {/* 요약 카드 3개 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" />총 평가금액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatKRW(summary.totalKrw)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              ≈ ${(summary.totalKrw / exchangeRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PiggyBank className="h-4 w-4" />투자원금
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatKRW(summary.costKrw)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart2 className="h-4 w-4" />총 손익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", gainLossColor(summary.gainLossKrw))}>
              {formatKRW(summary.gainLossKrw)}
            </div>
            <div className={cn("mt-0.5 text-sm font-medium", gainLossColor(summary.gainLossPct))}>
              {formatPercent(summary.gainLossPct)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 계좌별 비중 + 퍼포먼스 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AllocationChart title="계좌별 비중" data={allocationData} />

        <Card>
          <CardHeader>
            <CardTitle>종목 퍼포먼스</CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                보유 종목 데이터 없음
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                {/* 상위 */}
                <div>
                  <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    <TrendingUp className="h-3.5 w-3.5" />상위
                  </div>
                  <div className="space-y-0">
                    {topPerformers.slice(0, 5).map((p) => (
                      <div key={p.ticker} className="flex items-center justify-between border-b py-2 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.ticker}</div>
                        </div>
                        <span className="ml-3 shrink-0 font-mono text-sm font-semibold text-emerald-600">
                          {formatPercent(p.gain_loss_pct)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 하위 */}
                <div>
                  <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-500">
                    <TrendingDown className="h-3.5 w-3.5" />하위
                  </div>
                  <div className="space-y-0">
                    {worstPerformers.slice(0, 5).map((p) => (
                      <div key={p.ticker} className="flex items-center justify-between border-b py-2 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.ticker}</div>
                        </div>
                        <span className={cn("ml-3 shrink-0 font-mono text-sm font-semibold", gainLossColor(p.gain_loss_pct))}>
                          {formatPercent(p.gain_loss_pct)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
