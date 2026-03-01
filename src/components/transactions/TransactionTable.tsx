"use client";

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
import { Pencil, Trash2 } from "lucide-react";
import { formatCompact } from "@/lib/format";
import { usePrivacy } from "@/contexts/privacy-context";
import type { Transaction } from "@/types";

interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: number) => void;
}

const MASK = "•••••";

function TypeBadge({ type }: { type: string }) {
  const t = useTranslations("Transactions");
  const colors: Record<string, string> = {
    buy: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    sell: "bg-red-100 text-red-700 hover:bg-red-100",
    dividend: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    deposit: "bg-gray-100 text-gray-700 hover:bg-gray-100",
    withdrawal: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  };
  return (
    <Badge variant="outline" className={colors[type] ?? ""}>
      {t(type as Parameters<typeof t>[0])}
    </Badge>
  );
}

export function TransactionTable({ transactions, onEdit, onDelete }: Props) {
  const t = useTranslations("Transactions");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const { isPrivate } = usePrivacy();

  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t("noData")}
      </div>
    );
  }

  const fmt = (value: number, currency: string) =>
    isPrivate ? MASK : formatCompact(value, currency, locale);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tCommon("date")}</TableHead>
            <TableHead>{t("type")}</TableHead>
            <TableHead>{t("ticker")}</TableHead>
            <TableHead className="text-right">{t("quantity")}</TableHead>
            <TableHead className="text-right">{t("price")}</TableHead>
            <TableHead className="text-right">{t("fees")}</TableHead>
            <TableHead className="text-right">{t("totalAmount")}</TableHead>
            <TableHead>{tCommon("note")}</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="whitespace-nowrap font-mono text-sm">
                {tx.date}
              </TableCell>
              <TableCell>
                <TypeBadge type={tx.type} />
              </TableCell>
              <TableCell>
                {tx.ticker ? (
                  <div>
                    <div className="font-medium text-sm">{tx.name}</div>
                    <div className="text-xs text-muted-foreground">{tx.ticker}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {tx.quantity > 0
                  ? (isPrivate ? MASK : tx.quantity.toLocaleString())
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmt(tx.price, tx.currency)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {tx.fees > 0 ? fmt(tx.fees, tx.currency) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                {fmt(tx.total_amount, tx.currency)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                {tx.note || "—"}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEdit(tx)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => onDelete(tx.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
