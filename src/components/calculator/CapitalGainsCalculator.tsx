"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useCapitalGains } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CapitalGainsHolding } from "@/types";

const DEDUCTION = 2_500_000;
const TAX_RATE = 0.22;

function fmtKrw(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(2)}억원`;
  if (abs >= 1_0000) return `${sign}${(abs / 1_0000).toFixed(0)}만원`;
  return `${sign}${abs.toLocaleString()}원`;
}

function fmtUsd(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CapitalGainsCalculator() {
  const t = useTranslations("TaxCalc");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data, isLoading } = useCapitalGains(year);

  // 절세 시뮬레이터: 각 종목별 추가 매도 수량
  const [simQty, setSimQty] = useState<Record<number, string>>({});

  const simExtra = useMemo(() => {
    if (!data) return 0;
    return (data.usd_holdings ?? []).reduce((sum, h) => {
      const qty = parseFloat(simQty[h.id] ?? "0") || 0;
      const gainPerShare = h.current_price - h.avg_cost;
      return sum + gainPerShare * qty;
    }, 0);
  }, [data, simQty]);

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground">{t("loading")}</div>;
  }

  if (!data) return null;

  const totalRealizedKrw = data.realized_gain_krw;
  const simTotalKrw = totalRealizedKrw + simExtra * data.exchange_rate;
  const simTaxable = Math.max(0, simTotalKrw - DEDUCTION);
  const simTax = simTaxable * TAX_RATE;
  const currentTax = data.tax_krw;
  const remainingDeduction = Math.max(0, DEDUCTION - totalRealizedKrw);

  // 공제 여유분 안에서 최대 추가 실현 가능 금액
  const safeExtraKrw = remainingDeduction;

  return (
    <div className="space-y-6">
      {/* 연도 선택 */}
      <div className="flex items-center gap-3">
        <Label>{t("year")}</Label>
        <div className="flex gap-1">
          {[currentYear - 1, currentYear].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                year === y
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {y}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("exchangeRate")}: ₩{data.exchange_rate.toLocaleString()}</span>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("realizedGain")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold font-mono", totalRealizedKrw >= 0 ? "text-emerald-600" : "text-red-500")}>
              {fmtKrw(totalRealizedKrw)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{fmtUsd(data.realized_gain_usd)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("deduction")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{fmtKrw(DEDUCTION)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {remainingDeduction > 0
                ? <span className="text-emerald-600">{t("remaining")}: {fmtKrw(remainingDeduction)}</span>
                : <span className="text-red-500">{t("exceeded")}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("taxable")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold font-mono", data.taxable_krw > 0 ? "text-orange-600" : "text-emerald-600")}>
              {fmtKrw(data.taxable_krw)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("taxRate")} 22%</div>
          </CardContent>
        </Card>

        <Card className={cn(currentTax > 0 ? "border-red-300" : "border-emerald-300")}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("estimatedTax")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold font-mono", currentTax > 0 ? "text-red-500" : "text-emerald-600")}>
              {currentTax > 0 ? fmtKrw(currentTax) : t("noTax")}
            </div>
            {currentTax > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">{t("taxNote")}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 절세 인사이트 배너 */}
      {remainingDeduction > 0 && data.usd_holdings.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          💡 {t("taxSavingHint", { amount: fmtKrw(safeExtraKrw) })}
        </div>
      )}

      {/* 실현 거래 목록 */}
      {data.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("realizedTransactions")} ({year})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("date")}</TableHead>
                    <TableHead>{t("stock")}</TableHead>
                    <TableHead className="text-right">{t("qty")}</TableHead>
                    <TableHead className="text-right">{t("sellPrice")}</TableHead>
                    <TableHead className="text-right">{t("avgCost")}</TableHead>
                    <TableHead className="text-right">{t("gainUsd")}</TableHead>
                    <TableHead className="text-right">{t("gainKrw")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transactions.map((tx, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">{tx.date}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{tx.name}</div>
                        <div className="text-xs text-muted-foreground">{tx.ticker}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{tx.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtUsd(tx.sell_price)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtUsd(tx.avg_cost)}</TableCell>
                      <TableCell className={cn("text-right font-mono text-sm", tx.realized_gain_usd >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {tx.realized_gain_usd >= 0 ? "+" : ""}{fmtUsd(tx.realized_gain_usd)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-sm", tx.realized_gain_krw >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {tx.realized_gain_krw >= 0 ? "+" : ""}{fmtKrw(tx.realized_gain_krw)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.transactions.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("noTransactions", { year })}
          </CardContent>
        </Card>
      )}

      {/* 연말 절세 시뮬레이터 */}
      {data.usd_holdings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("simulator")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t("simulatorDesc")}</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("stock")}</TableHead>
                    <TableHead className="text-right">{t("heldQty")}</TableHead>
                    <TableHead className="text-right">{t("avgCost")}</TableHead>
                    <TableHead className="text-right">{t("currentPrice")}</TableHead>
                    <TableHead className="text-right">{t("unrealizedGain")}</TableHead>
                    <TableHead className="text-right w-32">{t("simSellQty")}</TableHead>
                    <TableHead className="text-right">{t("simGain")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.usd_holdings.map((h: CapitalGainsHolding) => {
                    const qty = parseFloat(simQty[h.id] ?? "0") || 0;
                    const gainPerShare = h.current_price - h.avg_cost;
                    const simGainUsd = gainPerShare * qty;
                    const simGainKrw = simGainUsd * data.exchange_rate;
                    return (
                      <TableRow key={h.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{h.name}</div>
                          <div className="text-xs text-muted-foreground">{h.ticker}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{h.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtUsd(h.avg_cost)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtUsd(h.current_price)}</TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", h.unrealized_gain_usd >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {h.unrealized_gain_usd >= 0 ? "+" : ""}{fmtUsd(h.unrealized_gain_usd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            max={h.quantity}
                            step="1"
                            value={simQty[h.id] ?? ""}
                            onChange={(e) => setSimQty((prev) => ({ ...prev, [h.id]: e.target.value }))}
                            className="h-7 w-24 text-right font-mono text-xs ml-auto"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", simGainUsd >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {qty > 0 ? (simGainKrw >= 0 ? "+" : "") + fmtKrw(simGainKrw) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 시뮬레이션 결과 요약 */}
            {Object.values(simQty).some((v) => parseFloat(v) > 0) && (
              <div className="border-t p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("simExtraGain")}</span>
                  <span className={cn("font-mono font-medium", simExtra >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {simExtra >= 0 ? "+" : ""}{fmtKrw(simExtra * data.exchange_rate)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("simTotalGain")}</span>
                  <span className="font-mono font-medium">{fmtKrw(simTotalKrw)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>{t("simEstimatedTax")}</span>
                  <span className={cn("font-mono", simTax > currentTax ? "text-red-500" : "text-emerald-600")}>
                    {fmtKrw(simTax)}
                    {simTax > currentTax && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        +{fmtKrw(simTax - currentTax)}
                      </Badge>
                    )}
                    {simTax === 0 && currentTax === 0 && (
                      <Badge className="ml-2 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        {t("noTax")}
                      </Badge>
                    )}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 세금 안내 */}
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-xs text-muted-foreground space-y-1">
          <p>• {t("note1")}</p>
          <p>• {t("note2")}</p>
          <p>• {t("note3")}</p>
          <p>• {t("note4")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
