"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { useHoldings, useExchangeRate } from "@/hooks/use-api";
import { refreshPrices } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoldingsTable } from "@/components/accounts/HoldingsTable";
import { HoldingForm } from "@/components/accounts/HoldingForm";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { formatCurrency, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = Number(params.id);

  const { data: account } = useSWR<Account>(
    `/api/accounts`,
    async (url: string) => {
      const accounts = await fetcher(url);
      return accounts.find((a: Account) => a.id === accountId);
    }
  );

  const { data: holdings, mutate: mutateHoldings } = useHoldings(accountId);
  const { data: exchangeRateData } = useExchangeRate();
  const exchangeRate = exchangeRateData?.rate ?? 1350;

  const [formOpen, setFormOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingHolding, setEditingHolding] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    setRefreshing(true);
    const tickers = holdings.map((h: { ticker: string }) => h.ticker);
    await refreshPrices(tickers);
    await mutateHoldings();
    setRefreshing(false);
  }, [holdings, mutateHoldings]);

  const handleDelete = async (id: number) => {
    if (!confirm("이 종목을 삭제하시겠습니까?")) return;
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    mutateHoldings();
  };

  const totalValue = holdings?.reduce((sum: number, h: { quantity: number; current_price: number; avg_cost: number }) => {
    const price = h.current_price || h.avg_cost;
    return sum + h.quantity * price;
  }, 0) ?? 0;

  const totalCost = holdings?.reduce((sum: number, h: { quantity: number; avg_cost: number }) => {
    return sum + h.quantity * h.avg_cost;
  }, 0) ?? 0;

  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/accounts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{account?.name ?? "..."}</h1>
          <div className="mt-1 flex gap-2">
            {account && (
              <>
                <Badge variant="outline">
                  {account.type === "stock" ? "주식" : "은행"}
                </Badge>
                <Badge variant="secondary">{account.currency}</Badge>
                {account.broker && (
                  <Badge variant="outline">{account.broker}</Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">평가금액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {formatCurrency(totalValue, account?.currency ?? "KRW")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 손익</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold", gainLossColor(totalGainLoss))}>
              {formatCurrency(totalGainLoss, account?.currency ?? "KRW")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">수익률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold", gainLossColor(totalGainLossPct))}>
              {formatPercent(totalGainLossPct)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>보유 종목</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "조회 중..." : "주가 새로고침"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingHolding(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              종목 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <HoldingsTable
            holdings={holdings ?? []}
            accountCurrency={account?.currency ?? "KRW"}
            exchangeRate={exchangeRate}
            onEdit={(h) => {
              setEditingHolding(h);
              setFormOpen(true);
            }}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      {account && (
        <HoldingForm
          holding={editingHolding}
          accountId={accountId}
          currency={account.currency}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={() => mutateHoldings()}
        />
      )}
    </div>
  );
}
