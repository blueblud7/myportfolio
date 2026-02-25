"use client";

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
import { formatCurrency, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

interface HoldingRow {
  id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  current_price: number;
  change_pct: number;
}

interface Props {
  holdings: HoldingRow[];
  accountCurrency: string;
  exchangeRate: number;
  onEdit: (holding: HoldingRow) => void;
  onDelete: (id: number) => void;
}

export function HoldingsTable({ holdings, accountCurrency, exchangeRate, onEdit, onDelete }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        보유 종목이 없습니다. 종목을 추가해주세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>종목</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">매입가</TableHead>
            <TableHead className="text-right">현재가</TableHead>
            <TableHead className="text-right">평가금액</TableHead>
            <TableHead className="text-right">손익</TableHead>
            <TableHead className="text-right">수익률</TableHead>
            <TableHead className="text-right">등락</TableHead>
            {accountCurrency === "KRW" && (
              <TableHead className="text-right">USD 환산</TableHead>
            )}
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((h) => {
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
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-muted-foreground">{h.ticker}</div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {h.quantity.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(h.avg_cost, h.currency)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {h.current_price > 0
                    ? formatCurrency(h.current_price, h.currency)
                    : "-"}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(marketValue, h.currency)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", gainLossColor(gainLoss))}>
                  {formatCurrency(gainLoss, h.currency)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", gainLossColor(gainLossPct))}>
                  {formatPercent(gainLossPct)}
                </TableCell>
                <TableCell className="text-right">
                  {h.change_pct !== 0 && (
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
                    ${usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
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
