"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatPercent, gainLossColor, formatKRW, formatUSD } from "@/lib/format";
import { usePrivacy } from "@/contexts/privacy-context";
import { TrendingUp, TrendingDown, DollarSign, Wallet, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MASK = "•••••";

interface Props {
  totalKrw: number;
  totalUsd: number;
  gainLossKrw: number;
  gainLossPct: number;
  exchangeRate: number;
  stockValueKrw: number;
  bankValueKrw: number;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  accent?: string;
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm",
      accent && `border-l-4 ${accent}`
    )}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg)}>
          {icon}
        </div>
      </div>
      <p className="truncate text-lg font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
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
  const t = useTranslations("SummaryCards");
  const { isPrivate } = usePrivacy();
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const isGain = gainLossKrw >= 0;

  const fmt = (krwValue: number) => {
    if (isPrivate) return <span className="select-none tracking-widest opacity-40">{MASK}</span>;
    return currency === "KRW"
      ? formatKRW(krwValue)
      : formatUSD(krwValue / exchangeRate);
  };

  const subFmt = (krwValue: number) => {
    if (isPrivate) return <span className="select-none tracking-widest opacity-40">{MASK}</span>;
    return currency === "KRW"
      ? formatUSD(krwValue / exchangeRate)
      : formatKRW(krwValue);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("totalAssets")}
          value={fmt(totalKrw)}
          sub={subFmt(totalKrw)}
          icon={<Wallet className="h-4 w-4 text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-500/10"
          accent="border-l-blue-500"
        />

        <StatCard
          label={t("totalGainLoss")}
          value={<span className={gainLossColor(gainLossKrw)}>{fmt(gainLossKrw)}</span>}
          sub={<span className={gainLossColor(gainLossPct)}>{formatPercent(gainLossPct)}</span>}
          icon={
            isGain
              ? <TrendingUp className="h-4 w-4 text-emerald-600" />
              : <TrendingDown className="h-4 w-4 text-red-500" />
          }
          iconBg={isGain ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}
          accent={isGain ? "border-l-emerald-500" : "border-l-red-500"}
        />

        <StatCard
          label={t("stockBank")}
          value={fmt(stockValueKrw)}
          sub={<span>{t("bank")} {fmt(bankValueKrw)}</span>}
          icon={<Building2 className="h-4 w-4 text-violet-600" />}
          iconBg="bg-violet-50 dark:bg-violet-500/10"
          accent="border-l-violet-500"
        />

        <StatCard
          label={t("exchangeRate")}
          value={
            <span className="font-mono">
              ₩{exchangeRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
            </span>
          }
          sub="Yahoo Finance"
          icon={<DollarSign className="h-4 w-4 text-amber-600" />}
          iconBg="bg-amber-50 dark:bg-amber-500/10"
          accent="border-l-amber-500"
        />
      </div>
    </div>
  );
}
