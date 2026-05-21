"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { TotalAssetChart } from "@/components/dashboard/TotalAssetChart";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { PutCallRatioWidget } from "@/components/dashboard/PutCallRatioWidget";
import { FomoSentimentWidget } from "@/components/dashboard/FomoSentimentWidget";
import { TodaySignals } from "@/components/dashboard/TodaySignals";
import { TodayWatchWidget } from "@/components/dashboard/TodayWatchWidget";
import { useAccounts, useHoldings, useExchangeRate, useBankBalances, refreshPrices } from "@/hooks/use-api";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const { data: accounts } = useAccounts();
  const { data: holdings, mutate: mutateHoldings } = useHoldings();
  const { data: exchangeRateData } = useExchangeRate();
  const { data: bankBalances } = useBankBalances();
  const [snapshotCreated, setSnapshotCreated] = useState(false);
  const initialRefreshed = useRef(false);

  const exchangeRate = exchangeRateData?.rate ?? 1350;

  const handleRefreshPrices = useCallback(async (h: { ticker: string; manual_price: number | null }[]) => {
    const tickers = [...new Set(
      h.filter((x) => x.ticker !== "CASH" && !x.manual_price).map((x) => x.ticker)
    )];
    if (tickers.length === 0) return;
    await refreshPrices(tickers);
    await mutateHoldings();
    fetch("/api/snapshots", { method: "POST" }).then(() => setSnapshotCreated(true));
  }, [mutateHoldings]);

  useEffect(() => {
    if (!initialRefreshed.current && Array.isArray(holdings) && holdings.length > 0) {
      initialRefreshed.current = true;
      handleRefreshPrices(holdings as { ticker: string; manual_price: number | null }[]);
    }
  }, [holdings, handleRefreshPrices]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Array.isArray(holdings) && holdings.length > 0) {
        handleRefreshPrices(holdings as { ticker: string; manual_price: number | null }[]);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [holdings, handleRefreshPrices]);

  useEffect(() => {
    if (!snapshotCreated && initialRefreshed.current === false) {
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
          latestByAccount.set(b.account_id, { balance: b.balance, currency: acct?.currency ?? "KRW" });
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
      { name: t("stockLabel"), value: summary.stockValueKrw },
      { name: t("bankLabel"),  value: summary.bankValueKrw },
    ].filter((d) => d.value > 0);
  }, [summary, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="crumb">대시보드</div>
          <h1>{t("title")}</h1>
        </div>
        <div className="right">
          <span className="pill">
            <span className="dot" style={{ background: "var(--up)" }} />
            {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} KST
          </span>
        </div>
      </div>

      {/* 시장 지수 테이프 */}
      <MarketIndices />

      {/* 포트폴리오 요약 */}
      <SummaryCards
        totalKrw={summary.totalKrw}
        totalUsd={summary.totalUsd}
        gainLossKrw={summary.gainLossKrw}
        gainLossPct={summary.gainLossPct}
        exchangeRate={exchangeRate}
        stockValueKrw={summary.stockValueKrw}
        bankValueKrw={summary.bankValueKrw}
      />

      {/* 오늘 챙길 것 */}
      <TodayWatchWidget />

      {/* Today's Signals */}
      <TodaySignals />

      {/* 심리 지표 2열 */}
      <div className="stack-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <FomoSentimentWidget />
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">{t("putCallRatio")}</h3>
          </div>
          <div className="card-body card-body-padded">
            <PutCallRatioWidget />
          </div>
        </div>
      </div>

      {/* 자산 추이 차트 */}
      <TotalAssetChart />

      {/* 배분 2열 */}
      <div className="stack-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <AllocationChart title={t("byCurrency")} data={allocationByType} />
        <AllocationChart title={t("byAccount")} data={allocationByAccount} />
      </div>
    </div>
  );
}
