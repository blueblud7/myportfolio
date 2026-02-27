"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { translateSector } from "@/lib/sectors";
import { useReports, useExchangeRate } from "@/hooks/use-api";
import { usePrivacy } from "@/contexts/privacy-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatKRW, formatPercent, gainLossColor, formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { DividendCalendar } from "@/components/reports/DividendCalendar";
import { BenchmarkComparison } from "@/components/reports/BenchmarkComparison";

const MASK = "•••••";

export default function ReportsPage() {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { isPrivate } = usePrivacy();
  const { data: report, isLoading, mutate } = useReports();
  const { data: exchangeRateData } = useExchangeRate();
  const exchangeRate = exchangeRateData?.rate ?? 1350;
  const [perfCurrency, setPerfCurrency] = useState<"KRW" | "USD">("KRW");
  const [fetching, setFetching] = useState(false);

  type PerfSortKey = "name" | "account_name" | "quantity" | "avg_cost" | "current_price" | "market_value" | "gain_loss" | "gain_loss_pct";
  const [perfSort, setPerfSort] = useState<{ key: PerfSortKey; dir: "asc" | "desc" }>({ key: "gain_loss_pct", dir: "desc" });

  const handlePerfSort = (key: PerfSortKey) => {
    setPerfSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };
  const [fetchResult, setFetchResult] = useState<{ total: number; success: number; failed: number } | null>(null);

  const handleBulkFetch = async () => {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch("/api/stock-metadata", { method: "POST" });
      const result = await res.json();
      setFetchResult(result);
      await mutate();
    } finally {
      setFetching(false);
    }
  };

  const toKrw = (p: { currency: string }, val: number) =>
    p.currency === "USD" ? val * exchangeRate : val;

  const sortedPerformers = useMemo(() => {
    if (!report) return [];
    return [...report.all_performers].sort((a, b) => {
      let diff = 0;
      switch (perfSort.key) {
        case "name":          diff = a.name.localeCompare(b.name, locale); break;
        case "account_name":  diff = a.account_name.localeCompare(b.account_name, locale); break;
        case "quantity":      diff = a.quantity - b.quantity; break;
        case "avg_cost":      diff = toKrw(a, a.avg_cost) - toKrw(b, b.avg_cost); break;
        case "current_price": diff = toKrw(a, a.current_price) - toKrw(b, b.current_price); break;
        case "market_value":  diff = toKrw(a, a.market_value) - toKrw(b, b.market_value); break;
        case "gain_loss":     diff = toKrw(a, a.gain_loss) - toKrw(b, b.gain_loss); break;
        case "gain_loss_pct": diff = a.gain_loss_pct - b.gain_loss_pct; break;
      }
      return perfSort.dir === "asc" ? diff : -diff;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, perfSort, exchangeRate, locale]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="py-12 text-center text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noData")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const SortHead = ({
    colKey,
    label,
    right = false,
  }: {
    colKey: PerfSortKey;
    label: string;
    right?: boolean;
  }) => {
    const active = perfSort.key === colKey;
    return (
      <TableHead
        className={cn("cursor-pointer select-none group", right && "text-right")}
        onClick={() => handlePerfSort(colKey)}
      >
        <div className={cn("flex items-center gap-1 whitespace-nowrap", right ? "justify-end" : "justify-start")}>
          <span>{label}</span>
          {active ? (
            perfSort.dir === "asc"
              ? <ChevronUp className="h-3 w-3 shrink-0" />
              : <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
          )}
        </div>
      </TableHead>
    );
  };

  const allSectorOther =
    report.by_sector.length === 1 && report.by_sector[0].sector === "Other";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {fetchResult && (
            <span className="text-xs text-muted-foreground">
              {t("bulkFetchResult", { success: fetchResult.success, total: fetchResult.total })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkFetch}
            disabled={fetching}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", fetching && "animate-spin")} />
            {fetching ? t("bulkFetching") : t("bulkFetch")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AllocationChart
          title={t("byCurrency")}
          data={report.by_currency.map((c) => ({
            name: c.currency,
            value: c.value_krw,
          }))}
        />
        <AllocationChart
          title={t("byAccount")}
          data={report.by_account.map((a) => ({
            name: a.name,
            value: a.value_krw,
          }))}
        />
      </div>

      {report.by_sector.length > 0 && !allSectorOther ? (
        <AllocationChart
          title={t("bySector")}
          data={report.by_sector.map((s) => ({
            name: translateSector(s.sector, locale),
            value: s.value_krw,
          }))}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>{t("bySector")}</CardTitle>
          </CardHeader>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("noSectorData")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("topGainers")}
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                Best
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.top_performers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t("noDataShort")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ticker")}</TableHead>
                    <TableHead className="text-right">{t("returnRate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.top_performers.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.ticker}</div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-medium",
                          gainLossColor(p.gain_loss_pct)
                        )}
                      >
                        {formatPercent(p.gain_loss_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("topLosers")}
              <Badge variant="destructive">Worst</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.worst_performers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t("noDataShort")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ticker")}</TableHead>
                    <TableHead className="text-right">{t("returnRate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.worst_performers.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.ticker}</div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-medium",
                          gainLossColor(p.gain_loss_pct)
                        )}
                      >
                        {formatPercent(p.gain_loss_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>{t("allPerformance")}</CardTitle>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["KRW", "USD"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setPerfCurrency(cur)}
                className={cn(
                  "px-3 py-1 font-medium transition-colors",
                  perfCurrency === cur
                    ? "bg-blue-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {cur}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {report.all_performers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t("noDataShort")}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead colKey="name" label={t("ticker")} />
                    <SortHead colKey="account_name" label={t("account")} />
                    <SortHead colKey="quantity" label={t("quantity")} right />
                    <SortHead colKey="avg_cost" label={t("cost")} right />
                    <SortHead colKey="current_price" label={t("currentPrice")} right />
                    <SortHead colKey="market_value" label={t("valuation2")} right />
                    <SortHead colKey="gain_loss" label={t("gainLoss")} right />
                    <SortHead colKey="gain_loss_pct" label={t("returnRate")} right />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPerformers.map((p) => {
                    const toDisplay = (val: number) => {
                      if (perfCurrency === "KRW") {
                        const krw = p.currency === "USD" ? val * exchangeRate : val;
                        return formatCompact(krw, "KRW", locale);
                      } else {
                        const usd = p.currency === "KRW" ? val / exchangeRate : val;
                        return formatCompact(usd, "USD", locale);
                      }
                    };
                    return (
                      <TableRow key={`${p.ticker}-${p.account_name}`}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.ticker}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {p.account_name}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isPrivate ? MASK : p.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isPrivate ? MASK : toDisplay(p.avg_cost)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isPrivate ? MASK : toDisplay(p.current_price)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {isPrivate ? MASK : toDisplay(p.market_value)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", gainLossColor(p.gain_loss))}>
                          {isPrivate ? MASK : toDisplay(p.gain_loss)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono font-medium", gainLossColor(p.gain_loss_pct))}>
                          {formatPercent(p.gain_loss_pct)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("allocationDetail")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("account")}</TableHead>
                <TableHead className="text-right">{t("valuation")}</TableHead>
                <TableHead className="text-right">{t("weight")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.by_account.map((a) => (
                <TableRow key={a.name}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {isPrivate ? MASK : formatKRW(a.value_krw)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {a.pct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BenchmarkComparison />

      <DividendCalendar />

      <Card>
        <CardHeader>
          <CardTitle>{t("dividendIncome")}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.dividend_income.items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t("noDividendData")}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("totalDividend")}</span>
                <span className="text-lg font-bold font-mono">
                  {isPrivate ? MASK : formatKRW(report.dividend_income.total_krw)}
                </span>
                <span className="text-sm text-muted-foreground">/ 년</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ticker")}</TableHead>
                    <TableHead className="text-right">{t("perShare")}</TableHead>
                    <TableHead className="text-right">{t("annualIncome")}</TableHead>
                    <TableHead className="text-right">{t("dividendYield")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.dividend_income.items.map((item) => (
                    <TableRow key={item.ticker}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.ticker} · {item.quantity.toLocaleString()}주
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {isPrivate ? MASK : item.annual_dividend.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {isPrivate ? MASK : formatKRW(item.annual_income_krw)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600">
                        {item.dividend_yield.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
