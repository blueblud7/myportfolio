"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAccounts, useHoldings, useExchangeRate, refreshPrices } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/accounts/AccountForm";
import { AccountsOverview } from "@/components/accounts/AccountsOverview";
import { Plus, Pencil, Trash2, ArrowRight, RefreshCw } from "lucide-react";
import { formatPercent, gainLossColor } from "@/lib/format";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import type { Account } from "@/types";

export default function AccountsPage() {
  const t = useTranslations("Accounts");
  const { data: accounts, mutate } = useAccounts();
  const { data: holdings, mutate: mutateHoldings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");

  const handleRefreshAll = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    const tickers = [...new Set(
      (holdings as { ticker: string; manual_price: number | null }[])
        .filter((h) => h.ticker !== "CASH" && !h.manual_price)
        .map((h) => h.ticker)
    )];
    if (tickers.length === 0) return;
    setRefreshing(true);
    await refreshPrices(tickers);
    await mutateHoldings();
    setRefreshing(false);
  }, [holdings, mutateHoldings]);

  const exchangeRate = exchangeRateData?.rate ?? 1350;

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
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["KRW", "USD"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur)}
                className={cn(
                  "px-3 py-1 font-medium transition-colors",
                  currency === cur
                    ? "bg-blue-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefreshAll} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? t("refreshing") : t("refreshAll")}
          </Button>
          <Button onClick={() => { setEditingAccount(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newAccount")}
          </Button>
        </div>
      </div>

      <AccountsOverview currency={currency} />

      {!Array.isArray(accounts) || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noAccounts")}
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
                        {account.type === "stock" ? t("stock") : t("bank")}
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

                  {stat && stat.totalKrw > 0 && (
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">{t("valuation")}</span>
                        <span className="font-semibold">
                          <Money
                            value={currency === "USD" ? stat.totalKrw / exchangeRate : stat.totalKrw}
                            currency={currency === "USD" ? "USD" : undefined}
                          />
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">{t("gainLoss")}</span>
                        <span className={cn("text-sm font-medium", gainLossColor(gainLoss))}>
                          <Money
                            value={currency === "USD" ? gainLoss / exchangeRate : gainLoss}
                            currency={currency === "USD" ? "USD" : undefined}
                          />{" "}
                          <span className="text-xs">{formatPercent(gainLossPct)}</span>
                        </span>
                      </div>
                    </div>
                  )}

                  <Link href={`/accounts/${account.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      {t("viewDetail")}
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
