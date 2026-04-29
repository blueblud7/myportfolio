"use client";

import { useState, useMemo, useCallback, useEffect, useRef, startTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAccounts, useHoldings, useExchangeRate, refreshPrices, useAccountDailyChange } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/accounts/AccountForm";
import { AccountsOverview } from "@/components/accounts/AccountsOverview";
import { AccountTrendChart } from "@/components/accounts/AccountTrendChart";
import { Plus, Pencil, Trash2, ArrowRight, RefreshCw, LayoutGrid, List, GripVertical } from "lucide-react";
import { formatPercent, gainLossColor } from "@/lib/format";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import type { Account } from "@/types";

type ViewMode = "card" | "list";

export default function AccountsPage() {
  const t = useTranslations("Accounts");
  const { data: accounts, mutate } = useAccounts();
  const { data: holdings, mutate: mutateHoldings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const { data: dailyChanges } = useAccountDailyChange();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ updated: number; failed: string[] } | null>(null);
  const [currency, setCurrencyState] = useState<"KRW" | "USD">("KRW");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [orderedAccounts, setOrderedAccounts] = useState<Account[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  useEffect(() => {
    const saved = localStorage.getItem("portfolio_currency") as "KRW" | "USD" | null;
    if (saved === "USD") startTransition(() => setCurrencyState("USD"));
    const savedView = localStorage.getItem("accounts_view") as ViewMode | null;
    if (savedView) setViewMode(savedView);
    const savedOwner = localStorage.getItem("accounts_owner_filter");
    if (savedOwner) setOwnerFilter(savedOwner);
  }, []);

  const handleOwnerFilter = (v: string) => {
    setOwnerFilter(v);
    localStorage.setItem("accounts_owner_filter", v);
  };

  const owners = useMemo(() => {
    if (!Array.isArray(accounts)) return [];
    const set = new Set<string>();
    for (const a of accounts) if (a.owner) set.add(a.owner);
    return Array.from(set).sort();
  }, [accounts]);

  const hasUnassigned = useMemo(
    () => Array.isArray(accounts) && accounts.some((a) => !a.owner),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    if (ownerFilter === "all") return orderedAccounts;
    if (ownerFilter === "__unassigned__") return orderedAccounts.filter((a) => !a.owner);
    return orderedAccounts.filter((a) => a.owner === ownerFilter);
  }, [orderedAccounts, ownerFilter]);

  useEffect(() => {
    if (Array.isArray(accounts)) setOrderedAccounts(accounts);
  }, [accounts]);

  const setCurrency = useCallback((cur: "KRW" | "USD") => {
    setCurrencyState(cur);
    localStorage.setItem("portfolio_currency", cur);
  }, []);

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("accounts_view", mode);
  };

  const handleRefreshAll = useCallback(async () => {
    if (!holdings || holdings.length === 0) return;
    const tickers = [...new Set(
      (holdings as { ticker: string; manual_price: number | null }[])
        .filter((h) => h.ticker !== "CASH" && !h.manual_price)
        .map((h) => h.ticker)
    )];
    if (tickers.length === 0) return;
    setRefreshing(true);
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

  const initialRefreshed = useRef(false);
  useEffect(() => {
    if (!initialRefreshed.current && holdings && holdings.length > 0) {
      initialRefreshed.current = true;
      handleRefreshAll();
    }
  }, [holdings, handleRefreshAll]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") handleRefreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [handleRefreshAll]);

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

  // Drag-and-drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIndex(index);
  };

  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    const newOrder = [...orderedAccounts];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    setOrderedAccounts(newOrder);
    setDragIndex(null);
    setDropIndex(null);

    await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder.map((a, i) => ({ id: a.id, sort_order: i }))),
    });
    mutate();
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const totalDailyChange = useMemo(() => {
    if (!dailyChanges || filteredAccounts.length === 0) return null;
    let totalChange = 0;
    let totalPrev = 0;
    for (const account of filteredAccounts) {
      const daily = dailyChanges.find((d) => d.account_id === account.id);
      if (!daily || daily.prev_value === null) continue;
      totalChange += daily.daily_change; // already in KRW
      totalPrev += daily.prev_value;     // already in KRW
    }
    if (totalPrev === 0) return null;
    return { change: totalChange, pct: (totalChange / totalPrev) * 100 };
  }, [dailyChanges, filteredAccounts]);

  const isEmpty = !Array.isArray(orderedAccounts) || orderedAccounts.length === 0;
  const isFilteredEmpty = filteredAccounts.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">{t("title")}</h1>
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
        <div className="flex flex-wrap items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => handleViewMode("card")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors",
                viewMode === "card"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
              title="카드형"
              aria-label="카드형 보기"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleViewMode("list")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors border-l",
                viewMode === "list"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
              title="리스트형"
              aria-label="리스트형 보기"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 sm:mr-2", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{refreshing ? t("refreshing") : t("refreshAll")}</span>
          </Button>
          <Button size="sm" onClick={() => { setEditingAccount(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("newAccount")}</span>
          </Button>
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
              ? `모든 가격 조회 실패 (${refreshResult.failed.length}개) — Yahoo Finance 연결 문제`
              : `${refreshResult.updated}개 성공 / ${refreshResult.failed.length}개 실패: ${refreshResult.failed.slice(0, 5).join(", ")}${refreshResult.failed.length > 5 ? " 외" : ""}`}
          </span>
          <button onClick={() => setRefreshResult(null)} className="ml-2 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {(owners.length > 0 || hasUnassigned) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">소유자:</span>
          <button
            onClick={() => handleOwnerFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              ownerFilter === "all"
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            전체 ({orderedAccounts.length})
          </button>
          {owners.map((o) => {
            const count = orderedAccounts.filter((a) => a.owner === o).length;
            return (
              <button
                key={o}
                onClick={() => handleOwnerFilter(o)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  ownerFilter === o
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {o} ({count})
              </button>
            );
          })}
          {hasUnassigned && (
            <button
              onClick={() => handleOwnerFilter("__unassigned__")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                ownerFilter === "__unassigned__"
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              미지정 ({orderedAccounts.filter((a) => !a.owner).length})
            </button>
          )}
        </div>
      )}

      <AccountsOverview currency={currency} ownerFilter={ownerFilter} accounts={filteredAccounts} />

      <AccountTrendChart currency={currency} exchangeRate={exchangeRate} />

      {totalDailyChange && (
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">오늘 전체 변화</span>
          <span className={cn("font-semibold tabular-nums", gainLossColor(totalDailyChange.change))}>
            <Money
              value={currency === "USD" ? totalDailyChange.change / exchangeRate : totalDailyChange.change}
              currency={currency === "USD" ? "USD" : undefined}
            />
            <span className="ml-1.5 text-xs font-medium opacity-80">
              {formatPercent(totalDailyChange.pct)}
            </span>
          </span>
        </div>
      )}

      {isEmpty ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noAccounts")}
          </CardContent>
        </Card>
      ) : isFilteredEmpty ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            선택한 소유자의 계좌가 없습니다.
          </CardContent>
        </Card>
      ) : viewMode === "card" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((account, index) => {
            const stat = accountStats[account.id];
            const gainLoss = stat ? stat.totalKrw - stat.costKrw : 0;
            const gainLossPct = stat?.costKrw > 0 ? (gainLoss / stat.costKrw) * 100 : 0;
            const daily = dailyChanges?.find((d) => d.account_id === account.id);
            const isDragging = dragIndex === index;
            const isDropTarget = dropIndex === index && dragIndex !== index;

            return (
              <Card
                key={account.id}
                className={cn(
                  "relative transition-all",
                  isDragging && "opacity-40 scale-95",
                  isDropTarget && "ring-2 ring-indigo-500 ring-offset-1"
                )}
                draggable={ownerFilter === "all"}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
                    <div>
                      <CardTitle className="text-lg">{account.name}</CardTitle>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {account.type === "stock" ? t("stock") : t("bank")}
                        </Badge>
                        <Badge variant="secondary">{account.currency}</Badge>
                        {account.owner && (
                          <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400">
                            👤 {account.owner}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditingAccount(account); setFormOpen(true); }}
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
                      {daily && daily.prev_value !== null && (
                        <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-muted pt-1">
                          <span className="text-xs text-muted-foreground">{t("dailyChange")}</span>
                          <span className={cn("text-sm font-medium", gainLossColor(daily.daily_change))}>
                            <Money
                              value={currency === "USD" ? daily.daily_change / exchangeRate : daily.daily_change}
                              currency={currency === "USD" ? "USD" : undefined}
                            />{" "}
                            <span className="text-xs">{formatPercent(daily.daily_change_pct)}</span>
                          </span>
                        </div>
                      )}
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
      ) : (
        /* 리스트형 뷰 */
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="w-6 px-3 py-2" />
                <th className="px-4 py-2 text-left font-medium">{t("title")}</th>
                <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">브로커</th>
                <th className="px-4 py-2 text-right font-medium">{t("valuation")}</th>
                <th className="px-4 py-2 text-right font-medium hidden md:table-cell">{t("gainLoss")}</th>
                <th className="px-4 py-2 text-right font-medium hidden lg:table-cell">{t("dailyChange")}</th>
                <th className="px-4 py-2 text-right font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account, index) => {
                const stat = accountStats[account.id];
                const gainLoss = stat ? stat.totalKrw - stat.costKrw : 0;
                const gainLossPct = stat?.costKrw > 0 ? (gainLoss / stat.costKrw) * 100 : 0;
                const daily = dailyChanges?.find((d) => d.account_id === account.id);
                const isDragging = dragIndex === index;
                const isDropTarget = dropIndex === index && dragIndex !== index;

                return (
                  <tr
                    key={account.id}
                    className={cn(
                      "border-b last:border-0 transition-all",
                      isDragging && "opacity-40",
                      isDropTarget && "bg-indigo-500/10"
                    )}
                    draggable={ownerFilter === "all"}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <td className="px-3 py-3">
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/40 active:cursor-grabbing" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{account.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {account.type === "stock" ? t("stock") : t("bank")}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {account.currency}
                        </Badge>
                        {account.owner && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/40 text-blue-600 dark:text-blue-400">
                            👤 {account.owner}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {account.broker || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {stat && stat.totalKrw > 0 ? (
                        <Money
                          value={currency === "USD" ? stat.totalKrw / exchangeRate : stat.totalKrw}
                          currency={currency === "USD" ? "USD" : undefined}
                        />
                      ) : "—"}
                    </td>
                    <td className={cn("px-4 py-3 text-right hidden md:table-cell", gainLossColor(gainLoss))}>
                      {stat && stat.totalKrw > 0 ? (
                        <div>
                          <Money
                            value={currency === "USD" ? gainLoss / exchangeRate : gainLoss}
                            currency={currency === "USD" ? "USD" : undefined}
                          />
                          <div className="text-xs">{formatPercent(gainLossPct)}</div>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {daily && daily.prev_value !== null ? (
                        <span className={cn(gainLossColor(daily.daily_change))}>
                          <Money
                            value={currency === "USD" ? daily.daily_change / exchangeRate : daily.daily_change}
                            currency={currency === "USD" ? "USD" : undefined}
                          />
                          <div className="text-xs">{formatPercent(daily.daily_change_pct)}</div>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditingAccount(account); setFormOpen(true); }}
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
                        <Link href={`/accounts/${account.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
