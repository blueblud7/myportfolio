"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAccounts, useHoldings, useExchangeRate } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/accounts/AccountForm";
import { AccountsOverview } from "@/components/accounts/AccountsOverview";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { formatKRW, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account } from "@/types";

export default function AccountsPage() {
  const { data: accounts, mutate } = useAccounts();
  const { data: holdings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const exchangeRate = exchangeRateData?.rate ?? 1350;

  // 계좌별 평가금액 + 손익 계산
  const accountStats = useMemo(() => {
    if (!Array.isArray(holdings)) return {};
    const stats: Record<number, { totalKrw: number; costKrw: number }> = {};
    for (const h of holdings as {
      account_id: number; ticker: string; quantity: number;
      avg_cost: number; current_price: number; currency: string;
    }[]) {
      const price = h.ticker === "CASH" ? h.avg_cost : (h.current_price || h.avg_cost);
      const value = h.quantity * price;
      const cost = h.quantity * h.avg_cost;
      const mul = h.currency === "USD" ? exchangeRate : 1;
      if (!stats[h.account_id]) stats[h.account_id] = { totalKrw: 0, costKrw: 0 };
      stats[h.account_id].totalKrw += value * mul;
      stats[h.account_id].costKrw += cost * mul;
    }
    return stats;
  }, [holdings, exchangeRate]);

  const handleDelete = async (id: number) => {
    if (!confirm("이 계좌를 삭제하시겠습니까? 모든 보유종목도 함께 삭제됩니다.")) return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">계좌 관리</h1>
        <Button onClick={() => { setEditingAccount(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          새 계좌
        </Button>
      </div>

      {/* Overall 통계 */}
      <AccountsOverview />

      {/* 계좌 카드 목록 */}
      {!Array.isArray(accounts) || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            등록된 계좌가 없습니다. 새 계좌를 추가해주세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const stat = accountStats[account.id];
            const gainLoss = stat ? stat.totalKrw - stat.costKrw : 0;
            const gainLossPct = stat?.costKrw > 0 ? (gainLoss / stat.costKrw) * 100 : 0;

            return (
              <Card key={account.id} className="relative">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg">{account.name}</CardTitle>
                    <div className="mt-1 flex gap-2">
                      <Badge variant="outline">
                        {account.type === "stock" ? "주식" : "은행"}
                      </Badge>
                      <Badge variant="secondary">{account.currency}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingAccount(account);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(account.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {account.broker && (
                    <p className="text-sm text-muted-foreground">{account.broker}</p>
                  )}

                  {/* 계좌별 수치 */}
                  {stat && stat.totalKrw > 0 && (
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">평가금액</span>
                        <span className="font-semibold">{formatKRW(stat.totalKrw)}</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">손익</span>
                        <span className={cn("text-sm font-medium", gainLossColor(gainLoss))}>
                          {formatKRW(gainLoss)}{" "}
                          <span className="text-xs">{formatPercent(gainLossPct)}</span>
                        </span>
                      </div>
                    </div>
                  )}

                  <Link href={`/accounts/${account.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      상세 보기
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AccountForm
        account={editingAccount}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={() => mutate()}
      />
    </div>
  );
}
