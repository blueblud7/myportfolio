"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import useSWR from "swr";
import { useHoldings, useExchangeRate, useTransactions } from "@/hooks/use-api";
import { refreshPrices } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoldingsTable } from "@/components/accounts/HoldingsTable";
import { HoldingForm } from "@/components/accounts/HoldingForm";
import { KiwoomSyncDialog } from "@/components/accounts/KiwoomSyncDialog";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { ArrowLeft, Plus, RefreshCw, Download } from "lucide-react";
import { formatPercent, gainLossColor } from "@/lib/format";
import { downloadCsv } from "@/lib/export";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import type { Account, Transaction } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AccountDetailPage() {
  const t = useTranslations("AccountDetail");
  const tTx = useTranslations("Transactions");
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
  const { data: transactions, mutate: mutateTransactions } = useTransactions(accountId);
  const exchangeRate = exchangeRateData?.rate ?? 1350;

  const [formOpen, setFormOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingHolding, setEditingHolding] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [kiwoomOpen, setKiwoomOpen] = useState(false);
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const autoRefreshed = useRef(false);

  const [txFormOpen, setTxFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const getRefreshTickers = useCallback(() => {
    if (!holdings) return [];
    return holdings
      .filter((h: { ticker: string; manual_price: number | null }) => h.ticker !== "CASH" && !h.manual_price)
      .map((h: { ticker: string }) => h.ticker);
  }, [holdings]);

  useEffect(() => {
    if (!holdings || holdings.length === 0 || autoRefreshed.current) return;
    const hasNoPrice = holdings.some((h: { current_price: number; ticker: string; manual_price: number | null }) => !h.current_price && h.ticker !== "CASH" && !h.manual_price);
    if (hasNoPrice) {
      autoRefreshed.current = true;
      const tickers = getRefreshTickers();
      setRefreshing(true);
      refreshPrices(tickers).then(() => mutateHoldings()).finally(() => setRefreshing(false));
    }
  }, [holdings, mutateHoldings, getRefreshTickers]);

  useEffect(() => {
    const id = setInterval(async () => {
      const tickers = getRefreshTickers();
      if (tickers.length === 0) return;
      setRefreshing(true);
      await refreshPrices(tickers);
      await mutateHoldings();
      setRefreshing(false);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [getRefreshTickers, mutateHoldings]);

  const handleRefresh = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    setRefreshing(true);
    const tickers = holdings
      .filter((h: { ticker: string; manual_price: number | null }) => h.ticker !== "CASH" && !h.manual_price)
      .map((h: { ticker: string }) => h.ticker);
    await refreshPrices(tickers);
    await mutateHoldings();
    setRefreshing(false);
  }, [holdings, mutateHoldings]);

  const handleDelete = async (id: number) => {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    mutateHoldings();
  };

  const handleTxDelete = async (id: number) => {
    if (!confirm(tTx("deleteConfirm"))) return;
    await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    mutateTransactions();
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/accounts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{account?.name ?? "..."}</h1>
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
            <div className="mt-1 flex gap-2">
              {account && (
                <>
                  <Badge variant="outline">
                    {account.type === "stock" ? t("stock") : t("bank")}
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("valuation")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                <Money
                  value={currency === "USD"
                    ? ((account?.currency ?? "KRW") === "KRW" ? totalValue / exchangeRate : totalValue)
                    : ((account?.currency ?? "KRW") === "USD" ? totalValue * exchangeRate : totalValue)}
                  currency={currency}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("totalGainLoss")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", gainLossColor(totalGainLoss))}>
                <Money
                  value={currency === "USD"
                    ? ((account?.currency ?? "KRW") === "KRW" ? totalGainLoss / exchangeRate : totalGainLoss)
                    : ((account?.currency ?? "KRW") === "USD" ? totalGainLoss * exchangeRate : totalGainLoss)}
                  currency={currency}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("returnRate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", gainLossColor(totalGainLossPct))}>
                {formatPercent(totalGainLossPct)}
              </div>
            </CardContent>
          </Card>
      </div>

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">{t("holdings")}</TabsTrigger>
          <TabsTrigger value="transactions">{tTx("title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("holdings")}</CardTitle>
              <div className="flex gap-2">
                {account?.type === "stock" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setKiwoomOpen(true)}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    {t("kiwoomSync")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")} />
                  {refreshing ? t("refreshing") : t("refresh")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!holdings) return;
                    const rows = holdings.map((h: Record<string, unknown>) => ({
                      ticker: h.ticker,
                      name: h.name,
                      quantity: h.quantity,
                      avg_cost: h.avg_cost,
                      current_price: h.current_price || h.avg_cost,
                      currency: h.currency,
                      date: h.date,
                      note: h.note,
                    }));
                    downloadCsv(`holdings_${account?.name ?? accountId}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
                  }}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingHolding(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t("addHolding")}
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
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{tTx("title")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!transactions || transactions.length === 0) return;
                  downloadCsv(
                    `transactions_${account?.name ?? accountId}_${new Date().toISOString().slice(0, 10)}.csv`,
                    transactions
                  );
                }}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTx(null);
                  setTxFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                {tTx("addTransaction")}
              </Button>
            </CardHeader>
            <CardContent>
              <TransactionTable
                transactions={transactions ?? []}
                onEdit={(tx) => {
                  setEditingTx(tx);
                  setTxFormOpen(true);
                }}
                onDelete={handleTxDelete}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      <TransactionForm
        transaction={editingTx}
        accountId={accountId}
        accountCurrency={account?.currency}
        open={txFormOpen}
        onClose={() => setTxFormOpen(false)}
        onSave={() => {
          mutateTransactions();
          mutateHoldings();
        }}
      />

      <KiwoomSyncDialog
        accountId={accountId}
        open={kiwoomOpen}
        onClose={() => setKiwoomOpen(false)}
        onSynced={() => mutateHoldings()}
      />
    </div>
  );
}
