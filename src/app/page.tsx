"use client";

import { useEffect, useState, useMemo } from "react";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { TotalAssetChart } from "@/components/dashboard/TotalAssetChart";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { useAccounts, useHoldings, useExchangeRate, useBankBalances } from "@/hooks/use-api";

export default function DashboardPage() {
  const { data: accounts } = useAccounts();
  const { data: holdings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const { data: bankBalances } = useBankBalances();
  const [snapshotCreated, setSnapshotCreated] = useState(false);

  const exchangeRate = exchangeRateData?.rate ?? 1350;

  useEffect(() => {
    if (!snapshotCreated) {
      fetch("/api/snapshots", { method: "POST" }).then(() => setSnapshotCreated(true));
    }
  }, [snapshotCreated]);

  const summary = useMemo(() => {
    if (!Array.isArray(holdings) || !Array.isArray(accounts)) {
      return { totalKrw: 0, totalUsd: 0, gainLossKrw: 0, gainLossPct: 0, stockValueKrw: 0, bankValueKrw: 0 };
    }

    let stockValueKrw = 0;
    let costBasisKrw = 0;

    for (const h of holdings as { quantity: number; avg_cost: number; current_price: number; currency: string }[]) {
      const price = h.current_price || h.avg_cost;
      const marketValue = h.quantity * price;
      const cost = h.quantity * h.avg_cost;
      if (h.currency === "USD") {
        stockValueKrw += marketValue * exchangeRate;
        costBasisKrw += cost * exchangeRate;
      } else {
        stockValueKrw += marketValue;
        costBasisKrw += cost;
      }
    }

    let bankValueKrw = 0;
    if (bankBalances) {
      const latestByAccount = new Map<number, { balance: number; currency: string }>();
      for (const b of bankBalances) {
        const existing = latestByAccount.get(b.account_id);
        if (!existing) {
          const acct = accounts.find((a) => a.id === b.account_id);
          latestByAccount.set(b.account_id, {
            balance: b.balance,
            currency: acct?.currency ?? "KRW",
          });
        }
      }
      for (const { balance, currency } of latestByAccount.values()) {
        bankValueKrw += currency === "USD" ? balance * exchangeRate : balance;
      }
    }

    const totalKrw = stockValueKrw + bankValueKrw;
    const totalUsd = totalKrw / exchangeRate;
    const gainLossKrw = stockValueKrw - costBasisKrw;
    const gainLossPct = costBasisKrw > 0 ? (gainLossKrw / costBasisKrw) * 100 : 0;

    return { totalKrw, totalUsd, gainLossKrw, gainLossPct, stockValueKrw, bankValueKrw };
  }, [holdings, accounts, bankBalances, exchangeRate]);

  const allocationByAccount = useMemo(() => {
    if (!Array.isArray(accounts) || !Array.isArray(holdings)) return [];

    const valueByAccount: Record<string, number> = {};
    for (const h of holdings as { account_id: number; quantity: number; current_price: number; avg_cost: number; currency: string }[]) {
      const acct = accounts.find((a) => a.id === h.account_id);
      if (!acct) continue;
      const price = h.current_price || h.avg_cost;
      const value = h.quantity * price;
      const valueKrw = h.currency === "USD" ? value * exchangeRate : value;
      valueByAccount[acct.name] = (valueByAccount[acct.name] ?? 0) + valueKrw;
    }
    return Object.entries(valueByAccount).map(([name, value]) => ({ name, value }));
  }, [accounts, holdings, exchangeRate]);

  const allocationByType = useMemo(() => {
    return [
      { name: "주식", value: summary.stockValueKrw },
      { name: "은행", value: summary.bankValueKrw },
    ].filter((d) => d.value > 0);
  }, [summary]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      <SummaryCards
        totalKrw={summary.totalKrw}
        totalUsd={summary.totalUsd}
        gainLossKrw={summary.gainLossKrw}
        gainLossPct={summary.gainLossPct}
        exchangeRate={exchangeRate}
        stockValueKrw={summary.stockValueKrw}
        bankValueKrw={summary.bankValueKrw}
      />

      <TotalAssetChart />

      <div className="grid gap-4 md:grid-cols-2">
        <AllocationChart title="자산 구성 (유형별)" data={allocationByType} />
        <AllocationChart title="자산 구성 (계좌별)" data={allocationByAccount} />
      </div>
    </div>
  );
}
