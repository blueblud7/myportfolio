"use client";

import { useState, useCallback, useEffect, useMemo, useRef, startTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import useSWR from "swr";
import { useHoldings, useExchangeRate, useTransactions } from "@/hooks/use-api";
import { refreshPrices } from "@/hooks/use-api";
import { HoldingsTable } from "@/components/accounts/HoldingsTable";
import { HoldingForm } from "@/components/accounts/HoldingForm";
import { HoldingsPieChart } from "@/components/accounts/HoldingsPieChart";
import { KiwoomSyncDialog } from "@/components/accounts/KiwoomSyncDialog";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { BenchmarkComparison } from "@/components/reports/BenchmarkComparison";
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
  const [refreshResult, setRefreshResult] = useState<{ updated: number; failed: string[] } | null>(null);
  const [kiwoomOpen, setKiwoomOpen] = useState(false);
  const [currency, setCurrencyState] = useState<"KRW" | "USD">("KRW");
  useEffect(() => {
    const saved = localStorage.getItem("portfolio_currency") as "KRW" | "USD" | null;
    if (saved === "USD") startTransition(() => setCurrencyState("USD"));
  }, []);
  const setCurrency = useCallback((cur: "KRW" | "USD") => {
    setCurrencyState(cur);
    localStorage.setItem("portfolio_currency", cur);
  }, []);
  const autoRefreshed = useRef(false);

  const [activeTab, setActiveTab] = useState<"holdings" | "transactions" | "benchmark">("holdings");

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
    try {
      const result = await refreshPrices(tickers);
      setRefreshResult({ updated: result.updated ?? 0, failed: result.failed ?? [] });
      await mutateHoldings();
    } catch (e) {
      setRefreshResult({ updated: 0, failed: tickers });
      console.error("refresh failed", e);
    } finally {
      setRefreshing(false);
    }
  }, [holdings, mutateHoldings]);

  // 탭이 포커스될 때마다 자동 새로고침
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") handleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [handleRefresh]);

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

  const totalDailyProfit = holdings?.reduce((sum: number, h: { quantity: number; current_price: number; change_pct: number; ticker: string; avg_cost: number }) => {
    if (h.ticker === "CASH") return sum;
    const price = h.current_price || h.avg_cost;
    return sum + h.quantity * price * ((h.change_pct ?? 0) / 100);
  }, 0) ?? 0;

  const holdingsAllocation = useMemo(() => {
    if (!Array.isArray(holdings)) return [];
    return (holdings as {
      ticker: string; name?: string; quantity: number;
      avg_cost: number; current_price: number; currency: string;
    }[])
      .map((h) => {
        const price = h.ticker === "CASH" ? h.avg_cost : (h.current_price || h.avg_cost);
        const value = h.quantity * price * (h.currency === "USD" ? exchangeRate : 1);
        return { name: h.ticker === "CASH" ? "현금" : (h.name || h.ticker), value };
      })
      .filter((d) => d.value > 0);
  }, [holdings, exchangeRate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/accounts">
            <button className="btn btn-ghost btn-icon">
              <ArrowLeft size={15} />
            </button>
          </Link>
          <div>
            <div className="crumb">포트폴리오</div>
            <h1>{account?.name ?? "..."}</h1>
          </div>
        </div>
        <div className="right">
          <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
            {account && (
              <>
                <span className="badge badge-outline">
                  {account.type === "stock" ? t("stock") : t("bank")}
                </span>
                <span className="badge">{account.currency}</span>
                {account.broker && (
                  <span className="badge badge-outline">{account.broker}</span>
                )}
              </>
            )}
          </div>
          <div className="seg seg-sm">
            {(["KRW", "USD"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur as "KRW" | "USD")}
                className={`seg-btn${currency === cur ? " active" : ""}`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
      </div>

      {refreshResult && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs flex items-center justify-between",
            refreshResult.failed.length === 0
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : refreshResult.updated === 0
              ? "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400"
              : "border-yellow-500/30 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400"
          )}
        >
          <span>
            {refreshResult.failed.length === 0
              ? `가격 업데이트 완료 (${refreshResult.updated}개)`
              : refreshResult.updated === 0
              ? `모든 가격 조회 실패 (${refreshResult.failed.length}개): ${refreshResult.failed.slice(0, 5).join(", ")} — Yahoo Finance 연결 문제`
              : `${refreshResult.updated}개 성공 / ${refreshResult.failed.length}개 실패: ${refreshResult.failed.slice(0, 5).join(", ")}${refreshResult.failed.length > 5 ? " 외" : ""}`}
          </span>
          <button onClick={() => setRefreshResult(null)} className="ml-2 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      <div className="stack-4">
        <div className="card card-body-padded">
          <div className="section-title"><span>{t("valuation")}</span></div>
          <div className="num" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
            <Money
              value={currency === "USD"
                ? ((account?.currency ?? "KRW") === "KRW" ? totalValue / exchangeRate : totalValue)
                : ((account?.currency ?? "KRW") === "USD" ? totalValue * exchangeRate : totalValue)}
              currency={currency}
            />
          </div>
        </div>
        <div className="card card-body-padded">
          <div className="section-title"><span>{t("totalGainLoss")}</span></div>
          <div className={cn("num", gainLossColor(totalGainLoss))} style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
            <Money
              value={currency === "USD"
                ? ((account?.currency ?? "KRW") === "KRW" ? totalGainLoss / exchangeRate : totalGainLoss)
                : ((account?.currency ?? "KRW") === "USD" ? totalGainLoss * exchangeRate : totalGainLoss)}
              currency={currency}
            />
          </div>
        </div>
        <div className="card card-body-padded">
          <div className="section-title"><span>{t("returnRate")}</span></div>
          <div className={cn("num", gainLossColor(totalGainLossPct))} style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
            {formatPercent(totalGainLossPct)}
          </div>
        </div>
        <div className="card card-body-padded">
          <div className="section-title"><span>{t("dailyProfit")}</span></div>
          <div className={cn("num", gainLossColor(totalDailyProfit))} style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
            <Money
              value={currency === "USD"
                ? ((account?.currency ?? "KRW") === "KRW" ? totalDailyProfit / exchangeRate : totalDailyProfit)
                : ((account?.currency ?? "KRW") === "USD" ? totalDailyProfit * exchangeRate : totalDailyProfit)}
              currency={currency}
            />
          </div>
        </div>
      </div>

      {holdingsAllocation.length > 1 && (
        <div className="card">
          <div className="card-head">
            <div><h3 className="card-title">종목 비율</h3></div>
          </div>
          <div className="card-body card-body-padded">
            <HoldingsPieChart data={holdingsAllocation} />
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab${activeTab === "holdings" ? " active" : ""}`} onClick={() => setActiveTab("holdings")}>{t("holdings")}</button>
        <button className={`tab${activeTab === "transactions" ? " active" : ""}`} onClick={() => setActiveTab("transactions")}>{tTx("title")}</button>
        <button className={`tab${activeTab === "benchmark" ? " active" : ""}`} onClick={() => setActiveTab("benchmark")}>{t("benchmarkTab")}</button>
      </div>

      {activeTab === "holdings" && (
        <div className="card">
          <div className="card-head">
            <div><h3 className="card-title">{t("holdings")}</h3></div>
            <div style={{ display: "flex", gap: 8 }}>
              {account?.type === "stock" && (
                <button
                  className="btn"
                  onClick={() => setKiwoomOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("kiwoomSync")}
                </button>
              )}
              <button
                className="btn"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                {refreshing ? t("refreshing") : t("refresh")}
              </button>
              <button
                className="btn"
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
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingHolding(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addHolding")}
              </button>
            </div>
          </div>
          <div className="card-body">
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
          </div>
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="card">
          <div className="card-head">
            <div><h3 className="card-title">{tTx("title")}</h3></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  if (!transactions || transactions.length === 0) return;
                  downloadCsv(
                    `transactions_${account?.name ?? accountId}_${new Date().toISOString().slice(0, 10)}.csv`,
                    transactions
                  );
                }}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingTx(null);
                  setTxFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {tTx("addTransaction")}
              </button>
            </div>
          </div>
          <div className="card-body">
            <TransactionTable
              transactions={transactions ?? []}
              onEdit={(tx) => {
                setEditingTx(tx);
                setTxFormOpen(true);
              }}
              onDelete={handleTxDelete}
            />
          </div>
        </div>
      )}

      {activeTab === "benchmark" && (
        <BenchmarkComparison fixedAccountId={accountId} />
      )}

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
