"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { translateSector } from "@/lib/sectors";
import { useReports } from "@/hooks/use-api";
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
import { formatKRW, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const MASK = "•••••";

export default function ReportsPage() {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { isPrivate } = usePrivacy();
  const { data: report, isLoading, mutate } = useReports();
  const [fetching, setFetching] = useState(false);
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
        <CardHeader>
          <CardTitle>{t("allPerformance")}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.all_performers.length === 0 ? (
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
                {report.all_performers.map((p) => (
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
