"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
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

// ─── 모바일 카드 ─────────────────────────────────────────────────────────────
function MobileHoldingCard({
  h, locale, isPrivate, onEdit, onDelete,
}: {
  h: HoldingRow;
  locale: string;
  isPrivate: boolean;
  onEdit: (h: HoldingRow) => void;
  onDelete: (id: number) => void;
}) {
  const isCash = h.ticker === "CASH";
  const price = h.current_price || h.avg_cost;
  const marketValue = h.quantity * price;
  const costBasis = h.quantity * h.avg_cost;
  const gainLoss = marketValue - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  const fmt = (v: number, cur: string) =>
    isPrivate ? MASK : formatCompact(v, cur, locale);

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
      {/* Row 1: 종목명 + 평가금액 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0, flex: 1, marginRight: 8, lineHeight: 1.3 }}>
          {h.name}
          {h.manual_price != null && (
            <span style={{ fontSize: 10, color: "var(--fg-4)", marginLeft: 5, fontWeight: 400 }}>수동</span>
          )}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
          {fmt(marketValue, h.currency)}
        </div>
      </div>

      {/* Row 2: 티커 + 손익 + 수익률 + 액션 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isCash ? (
          <span style={{ fontSize: 12, color: "var(--fg-4)" }}>{h.ticker}</span>
        ) : (
          <Link
            href={`/stocks/${encodeURIComponent(h.ticker)}`}
            style={{ fontSize: 12, color: "var(--fg-4)", flexShrink: 0 }}
          >
            {h.ticker}
          </Link>
        )}
        {!isCash && (
          <>
            <span
              className={gainLossColor(gainLoss)}
              style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
            >
              {fmt(gainLoss, h.currency)}
            </span>
            <span
              className={gainLossColor(gainLossPct)}
              style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
            >
              {formatPercent(gainLossPct)}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, flexShrink: 0 }}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(h)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(h.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 3: 수량·평단·현재가·일변동 */}
      {!isCash && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 5 }}>
          {[
            { label: "수량", val: isPrivate ? MASK : h.quantity.toLocaleString() },
            { label: "평단", val: fmt(h.avg_cost, h.currency) },
            h.current_price > 0 ? { label: "현재", val: fmt(h.current_price, h.currency) } : null,
          ].filter(Boolean).map((item) => (
            <span key={item!.label} style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--fg-4)" }}>{item!.label} </span>{item!.val}
            </span>
          ))}
          {h.change_pct !== 0 && (
            <span className={gainLossColor(h.change_pct)} style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
              {formatPercent(h.change_pct)} 오늘
            </span>
          )}
          {h.note && (
            <span style={{ fontSize: 11, color: "var(--fg-4)", fontStyle: "italic", width: "100%" }}>
              {h.note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
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
    isPrivate ? MASK : formatCompact(value, currency, locale);

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
    <div>
      {/* 데스크탑 테이블 */}
      <div className="desktop-only" style={{ overflowX: "auto" }}>
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
                      {isCash ? (
                        <div className="text-xs text-muted-foreground">{h.ticker}</div>
                      ) : (
                        <Link
                          href={`/stocks/${encodeURIComponent(h.ticker)}`}
                          className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                        >
                          {h.ticker}
                        </Link>
                      )}
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(h)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(h.id)}>
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

      {/* 모바일 카드 리스트 */}
      <div className="mobile-only">
        {sorted.map((h) => (
          <MobileHoldingCard
            key={h.id}
            h={h}
            locale={locale}
            isPrivate={isPrivate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
