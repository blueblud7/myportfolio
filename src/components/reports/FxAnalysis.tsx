"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

interface FxItem {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  purchase_fx: number;
  current_fx: number;
  stock_return_usd: number;
  fx_return: number;
  total_return_krw: number;
  market_value_usd: number;
  market_value_krw: number;
  purchase_date: string;
}

interface FxResponse {
  items: FxItem[];
  current_fx: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function FxAnalysis() {
  const t = useTranslations("FxAnalysis");
  const { data, isLoading } = useSWR<FxResponse>("/api/fx-analysis", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">{t("loading")}</div>;
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t("noData")}
        </CardContent>
      </Card>
    );
  }

  const { items, current_fx } = data;

  const chartData = items.map((item) => ({
    name: item.ticker,
    [t("stockReturn")]: parseFloat(item.stock_return_usd.toFixed(2)),
    [t("fxReturn")]: parseFloat(item.fx_return.toFixed(2)),
    [t("totalReturn")]: parseFloat(item.total_return_krw.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{t("currentFx")}: <span className="font-mono font-medium text-foreground">{current_fx.toLocaleString()}원</span></span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("chartDesc")}</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={52}
              />
              <Tooltip formatter={(val) => `${(val as number).toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar dataKey={t("stockReturn")} stackId="a" fill="#3b82f6">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={(d[t("stockReturn")] as number) >= 0 ? "#3b82f6" : "#ef4444"} />
                ))}
              </Bar>
              <Bar dataKey={t("fxReturn")} stackId="a" fill="#f59e0b">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={(d[t("fxReturn")] as number) >= 0 ? "#f59e0b" : "#fb923c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stock")}</TableHead>
                <TableHead className="text-right">{t("purchaseFx")}</TableHead>
                <TableHead className="text-right">{t("currentFxShort")}</TableHead>
                <TableHead className="text-right">{t("stockReturn")}</TableHead>
                <TableHead className="text-right">{t("fxReturn")}</TableHead>
                <TableHead className="text-right">{t("totalReturn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.ticker}>
                  <TableCell>
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.ticker}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.purchase_fx.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.current_fx.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm font-medium",
                      item.stock_return_usd >= 0 ? "text-blue-600" : "text-red-500"
                    )}
                  >
                    {formatPercent(item.stock_return_usd)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm",
                      item.fx_return >= 0 ? "text-amber-600" : "text-orange-500"
                    )}
                  >
                    {formatPercent(item.fx_return)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm font-bold",
                      item.total_return_krw >= 0 ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {formatPercent(item.total_return_krw)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">{t("note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
