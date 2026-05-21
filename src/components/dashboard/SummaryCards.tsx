"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatPercent, gainLossColor, formatKRW, formatUSD } from "@/lib/format";
import { usePrivacy } from "@/contexts/privacy-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSnapshots } from "@/hooks/use-api";
import { format, subDays } from "date-fns";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
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

const CARD_TITLES: Record<CardType, string> = {
  total: "총 자산 추이",
  gainloss: "수익률 추이",
  stockbank: "주식 / 은행 추이",
  exchange: "환율 추이",
};

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
    if (cardType === "total") return snapshots.map((s) => ({ date: s.date, value: Math.round(s.total_krw) }));
    if (cardType === "gainloss") {
      const base = snapshots[0].total_krw;
      if (base === 0) return [];
      return snapshots.map((s) => ({ date: s.date, value: Number((((s.total_krw - base) / base) * 100).toFixed(2)) }));
    }
    if (cardType === "stockbank") return snapshots.map((s) => ({ date: s.date, stock: Math.round(s.stock_krw), bank: Math.round(s.bank_krw) }));
    if (cardType === "exchange") return snapshots.map((s) => ({ date: s.date, value: s.exchange_rate }));
    return [];
  }, [snapshots, cardType]);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {CHART_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={period === p.key ? "btn btn-primary" : "btn"}
            style={{ height: 26, padding: "0 10px", fontSize: 11 }}
          >
            {p.key}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", fontSize: 13 }}>
          데이터 없음
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {cardType === "stockbank" ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <YAxis tickFormatter={(v) => formatKRW(v as number)} width={85} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <Tooltip formatter={(value) => [formatKRW(value as number), ""]} labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <Area type="monotone" dataKey="stock" name="주식" stroke="var(--up)" fill="var(--up)" fillOpacity={0.15} strokeWidth={1.5} />
              <Area type="monotone" dataKey="bank"  name="은행" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={1.5} />
            </AreaChart>
          ) : cardType === "gainloss" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <YAxis tickFormatter={(v) => `${v}%`} width={60} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, ""]} labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="value" name="수익률" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          ) : cardType === "exchange" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <YAxis tickFormatter={(v) => `₩${(v as number).toLocaleString()}`} width={80} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <Tooltip formatter={(value) => [`₩${(value as number).toLocaleString()}`, ""]} labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" name="환율" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MM/dd")} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <YAxis tickFormatter={(v) => formatKRW(v as number)} width={85} tick={{ fontSize: 11, fill: "var(--fg-4)" }} />
              <Tooltip formatter={(value) => [formatKRW(value as number), ""]} labelFormatter={(l) => format(new Date(l as string), "yyyy-MM-dd")} contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <Area type="monotone" dataKey="value" name="총 자산" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={1.5} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function SummaryCards({ totalKrw, totalUsd, gainLossKrw, gainLossPct, exchangeRate, stockValueKrw, bankValueKrw }: Props) {
  const t = useTranslations("SummaryCards");
  const { isPrivate } = usePrivacy();
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const isGain = gainLossKrw >= 0;

  const fmt = (krwValue: number) => {
    if (isPrivate) return MASK;
    return currency === "KRW" ? formatKRW(krwValue) : formatUSD(krwValue / exchangeRate);
  };

  const subFmt = (krwValue: number) => {
    if (isPrivate) return MASK;
    return currency === "KRW" ? formatUSD(krwValue / exchangeRate) : formatKRW(krwValue);
  };

  const cards: { type: CardType; label: string; value: string; sub: string; tone: string }[] = [
    {
      type: "total",
      label: t("totalAssets"),
      value: fmt(totalKrw),
      sub: subFmt(totalKrw),
      tone: "accent",
    },
    {
      type: "gainloss",
      label: t("totalGainLoss"),
      value: `${isGain ? "+" : ""}${fmt(gainLossKrw)}`,
      sub: isPrivate ? MASK : formatPercent(gainLossPct),
      tone: isGain ? "up" : "down",
    },
    {
      type: "stockbank",
      label: t("stockBank"),
      value: fmt(stockValueKrw),
      sub: `${t("bank")} ${fmt(bankValueKrw)}`,
      tone: "neutral",
    },
    {
      type: "exchange",
      label: t("exchangeRate"),
      value: `₩${exchangeRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`,
      sub: "Yahoo Finance",
      tone: "warn",
    },
  ];

  const toneColor: Record<string, string> = {
    accent:  "var(--accent)",
    up:      "var(--up)",
    down:    "var(--down)",
    warn:    "var(--warn)",
    neutral: "var(--fg-3)",
  };

  return (
    <>
      {/* Currency toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
        <div className="seg seg-sm">
          {(["KRW", "USD"] as const).map((cur) => (
            <button key={cur} className={`seg-btn${currency === cur ? " active" : ""}`} onClick={() => setCurrency(cur)}>
              {cur}
            </button>
          ))}
        </div>
      </div>

      {/* Tape-style summary strip */}
      <div className="tape">
        {cards.map((c) => (
          <div
            key={c.type}
            className="tape-cell"
            onClick={() => setSelectedCard(c.type)}
            style={{ cursor: "pointer", minWidth: 0, flex: 1 }}
          >
            <div className="name">{c.label}</div>
            <div className="value" style={{ fontSize: 16, color: toneColor[c.tone] }}>{c.value}</div>
            <div className="delta-row">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-4)" }}>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={selectedCard !== null} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-2xl" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--fg)", fontSize: 14 }}>{selectedCard ? CARD_TITLES[selectedCard] : ""}</DialogTitle>
          </DialogHeader>
          {selectedCard && <MetricChart cardType={selectedCard} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
