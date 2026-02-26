"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPercent, gainLossColor, formatCompact, currencyUnit } from "@/lib/format";
import { usePrivacy } from "@/contexts/privacy-context";
import { cn } from "@/lib/utils";
import { Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface HoldingRow {
  id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  current_price: number;
  change_pct: number;
  note: string;
  manual_price: number | null;
  date: string;
}

type SortKey =
  | "name"
  | "quantity"
  | "avg_cost"
  | "current_price"
  | "marketValue"
  | "gainLoss"
  | "gainLossPct"
  | "change_pct";

interface Props {
  holdings: HoldingRow[];
  accountCurrency: string;
  exchangeRate: number;
  onEdit: (holding: HoldingRow) => void;
  onDelete: (id: number) => void;
}

const MASK = "•••••";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 shrink-0" />
    : <ChevronDown className="h-3 w-3 shrink-0" />;
}

export function HoldingsTable({ holdings, accountCurrency, exchangeRate, onEdit, onDelete }: Props) {
  const t = useTranslations("HoldingsTable");
  const locale = useLocale();
  const { isPrivate } = usePrivacy();
  const unit = currencyUnit(accountCurrency, locale);

  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const aPrice = a.current_price || a.avg_cost;
      const bPrice = b.current_price || b.avg_cost;
      const aVal = a.quantity * aPrice;
      const bVal = b.quantity * bPrice;
      const aCost = a.quantity * a.avg_cost;
      const bCost = b.quantity * b.avg_cost;

      let diff = 0;
      switch (sortKey) {
        case "name": diff = a.name.localeCompare(b.name, locale); break;
        case "quantity": diff = a.quantity - b.quantity; break;
        case "avg_cost": diff = a.avg_cost - b.avg_cost; break;
        case "current_price": diff = aPrice - bPrice; break;
        case "marketValue": diff = aVal - bVal; break;
        case "gainLoss": diff = (aVal - aCost) - (bVal - bCost); break;
        case "gainLossPct": {
          const aPct = aCost > 0 ? (aVal - aCost) / aCost : 0;
          const bPct = bCost > 0 ? (bVal - bCost) / bCost : 0;
          diff = aPct - bPct;
          break;
        }
        case "change_pct": diff = a.change_pct - b.change_pct; break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [holdings, sortKey, sortDir, locale]);

  const fmt = (value: number, currency: string) =>
    isPrivate
      ? MASK
      : formatCompact(value, currency, locale);

  if (holdings.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t("noHoldings")}
      </div>
    );
  }

  const SortHead = ({
    colKey,
    label,
    unit: colUnit,
    right = false,
  }: {
    colKey: SortKey;
    label: string;
    unit?: string;
    right?: boolean;
  }) => (
    <TableHead
      className={cn("cursor-pointer select-none", right && "text-right")}
      onClick={() => handleSort(colKey)}
    >
      <div className={cn("flex items-center gap-1 whitespace-nowrap", right ? "justify-end" : "justify-start")}>
        <span>
          {label}
          {colUnit && (
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
              ({colUnit})
            </span>
          )}
        </span>
        <SortIcon active={sortKey === colKey} dir={sortDir} />
      </div>
    </TableHead>
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHead colKey="name" label={t("ticker")} />
            <SortHead colKey="quantity" label={t("quantity")} right />
            <SortHead colKey="avg_cost" label={t("cost")} unit={unit} right />
            <SortHead colKey="current_price" label={t("currentPrice")} unit={unit} right />
            <SortHead colKey="marketValue" label={t("valuation")} unit={unit} right />
            <SortHead colKey="gainLoss" label={t("gainLoss")} unit={unit} right />
            <SortHead colKey="gainLossPct" label={t("returnRate")} right />
            <SortHead colKey="change_pct" label={t("change")} right />
            {accountCurrency === "KRW" && (
              <TableHead className="text-right">{t("usdValue")}</TableHead>
            )}
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((h) => {
            const isCash = h.ticker === "CASH";
            const isManual = h.manual_price != null;
            const price = h.current_price || h.avg_cost;
            const marketValue = h.quantity * price;
            const costBasis = h.quantity * h.avg_cost;
            const gainLoss = marketValue - costBasis;
            const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
            const usdValue = h.currency === "KRW" ? marketValue / exchangeRate : marketValue;

            return (
              <TableRow key={h.id}>
                <TableCell>
                  <div>
                    <div className="flex items-center gap-1.5 font-medium">
                      {h.name}
                      {isManual && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-muted-foreground">
                          {t("manual")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{h.ticker}</div>
                    {h.note && (
                      <div className="mt-0.5 text-xs text-muted-foreground/70 italic">
                        {h.note}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {isCash ? "-" : (isPrivate ? MASK : h.quantity.toLocaleString())}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {isCash ? "-" : fmt(h.avg_cost, h.currency)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {isCash ? "-" : (h.current_price > 0 ? fmt(h.current_price, h.currency) : "-")}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {fmt(marketValue, h.currency)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", gainLossColor(gainLoss))}>
                  {isCash ? "-" : fmt(gainLoss, h.currency)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", gainLossColor(gainLossPct))}>
                  {isCash ? "-" : formatPercent(gainLossPct)}
                </TableCell>
                <TableCell className="text-right">
                  {!isCash && h.change_pct !== 0 && (
                    <Badge
                      variant={h.change_pct > 0 ? "default" : "destructive"}
                      className={cn(
                        "font-mono text-xs",
                        h.change_pct > 0 && "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      )}
                    >
                      {formatPercent(h.change_pct)}
                    </Badge>
                  )}
                </TableCell>
                {accountCurrency === "KRW" && (
                  <TableCell className="text-right font-mono text-muted-foreground text-xs">
                    {isPrivate ? MASK : formatCompact(usdValue, "USD", locale)}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(h)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete(h.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
