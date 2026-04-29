"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatPercent, gainLossColor, formatKRW, formatUSD } from "@/lib/format";
import { usePrivacy } from "@/contexts/privacy-context";
import { TrendingUp, TrendingDown, DollarSign, Wallet, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSnapshots } from "@/hooks/use-api";
import { format, subDays } from "date-fns";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const MASK = "•••••";

type CardType = "total" | "gainloss" | "stockbank" | "exchange";

interface Props {
  totalKrw: number;
  totalUsd: number;
  gainLossKrw: number;
  gainLossPct: number;
  exchangeRate: number;
  stockValueKrw: number;
  bankValueKrw: number;
}

const CHART_PERIODS = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 180 },
  { key: "1Y", days: 365 },
] as const;

function MetricChart({ cardType }: { cardType: CardType }) {
  const [period, setPeriod] = useState<string>("3M");

  const { start, end } = useMemo(() => {
    const now = new Date();
    const p = CHART_PERIODS.find((p) => p.key === period);
    if (!p) return { start: undefined, end: undefined };
    return {
      start: format(subDays(now, p.days), "yyyy-MM-dd"),
      end: format(now, "yyyy-MM-dd"),
    };
  }, [period]);

  const { data: snapshots } = useSnapshots(start, end);

  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    if (cardType === "total") {
      return snapshots.map((s) => ({ date: s.date, value: Math.round(s.total_krw) }));
    }
    if (cardType === "gainloss") {
      const base = snapshots[0].total_krw;
      if (base === 0) return [];
      return snapshots.map((s) => ({
        date: s.date,
        value: Number((((s.total_krw - base) / base) * 100).toFixed(2)),
      }));
    }
    if (cardType === "stockbank") {
      return snapshots.map((s) => ({
        date: s.date,
        stock: Math.round(s.stock_krw),
        bank: Math.round(s.bank_krw),
      }));
    }
    if (cardType === "exchange") {
      return snapshots.map((s) => ({ date: s.date, value: s.exchange_rate }));
    }
    return [];
  }, [snapshots, cardType]);

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {CHART_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium transition-colors",
              period === p.key
                ? "bg-indigo-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {p.key}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-[200px] sm:h-[250px] items-center justify-center text-muted-foreground text-sm">
          데이터 없음
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220} minHeight={180}>
          {cardType === "stockbank" ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatKRW(v as number)} className="text-xs" width={85} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatKRW(value as number), ""]}
                labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")}
              />
              <Area type="monotone" dataKey="stock" name="주식" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2} />
              <Area type="monotone" dataKey="bank" name="은행" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
            </AreaChart>
          ) : cardType === "gainloss" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v}%`} className="text-xs" width={60} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(2)}%`, ""]}
                labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")}
              />
              <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="value" name="수익률" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          ) : cardType === "exchange" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `₩${(v as number).toLocaleString()}`} className="text-xs" width={80} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [`₩${(value as number).toLocaleString()}`, ""]}
                labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")}
              />
              <Line type="monotone" dataKey="value" name="환율" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatKRW(v as number)} className="text-xs" width={85} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatKRW(value as number), ""]}
                labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")}
              />
              <Area type="monotone" dataKey="value" name="총 자산" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  accent,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 sm:p-4 shadow-sm",
        accent && `border-l-4 ${accent}`,
        onClick && "cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.99]"
      )}
      onClick={onClick}
    >
      <div className="mb-2 sm:mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <div className={cn("flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg", iconBg)}>
          {icon}
        </div>
      </div>
      <p className="truncate text-base sm:text-lg font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] sm:text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

const CARD_TITLES: Record<CardType, string> = {
  total: "총 자산 추이",
  gainloss: "수익률 추이",
  stockbank: "주식 / 은행 추이",
  exchange: "환율 추이",
};

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
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
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
    <>
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

        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label={t("totalAssets")}
            value={fmt(totalKrw)}
            sub={subFmt(totalKrw)}
            icon={<Wallet className="h-4 w-4 text-blue-600" />}
            iconBg="bg-blue-50 dark:bg-blue-500/10"
            accent="border-l-blue-500"
            onClick={() => setSelectedCard("total")}
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
            onClick={() => setSelectedCard("gainloss")}
          />

          <StatCard
            label={t("stockBank")}
            value={fmt(stockValueKrw)}
            sub={<span>{t("bank")} {fmt(bankValueKrw)}</span>}
            icon={<Building2 className="h-4 w-4 text-violet-600" />}
            iconBg="bg-violet-50 dark:bg-violet-500/10"
            accent="border-l-violet-500"
            onClick={() => setSelectedCard("stockbank")}
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
            onClick={() => setSelectedCard("exchange")}
          />
        </div>
      </div>

      <Dialog open={selectedCard !== null} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCard ? CARD_TITLES[selectedCard] : ""}</DialogTitle>
          </DialogHeader>
          {selectedCard && <MetricChart cardType={selectedCard} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
