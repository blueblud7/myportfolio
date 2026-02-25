"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRW, formatUSD, formatPercent, gainLossColor } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  totalKrw: number;
  totalUsd: number;
  gainLossKrw: number;
  gainLossPct: number;
  exchangeRate: number;
  stockValueKrw: number;
  bankValueKrw: number;
}

export function SummaryCards({
  totalKrw,
  totalUsd,
  gainLossKrw,
  gainLossPct,
  exchangeRate,
  stockValueKrw,
  bankValueKrw,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            총 자산
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatKRW(totalKrw)}</div>
          <p className="text-xs text-muted-foreground">{formatUSD(totalUsd)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            총 손익
          </CardTitle>
          {gainLossKrw >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", gainLossColor(gainLossKrw))}>
            {formatKRW(gainLossKrw)}
          </div>
          <p className={cn("text-xs", gainLossColor(gainLossPct))}>
            {formatPercent(gainLossPct)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            주식 / 은행
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatKRW(stockValueKrw)}</div>
          <p className="text-xs text-muted-foreground">
            은행 {formatKRW(bankValueKrw)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            환율 (USD/KRW)
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono">
            ₩{exchangeRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground">Yahoo Finance</p>
        </CardContent>
      </Card>
    </div>
  );
}
