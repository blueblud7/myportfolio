"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAccounts, useBankBalances } from "@/hooks/use-api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BankBalanceForm } from "@/components/bank/BankBalanceForm";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { formatKRW } from "@/lib/format";
import { Money } from "@/components/ui/money";
import { format } from "date-fns";
import type { Account } from "@/types";

export default function BankPage() {
  const t = useTranslations("Bank");
  const tCommon = useTranslations("Common");
  const { data: accounts } = useAccounts();
  const { data: balances, mutate } = useBankBalances();
  const [formOpen, setFormOpen] = useState(false);

  const bankAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "bank"),
    [accounts]
  );

  const balancesWithAccount = useMemo(() => {
    if (!balances || !accounts) return [];
    return balances.map((b) => {
      const acct = accounts.find((a) => a.id === b.account_id);
      return { ...b, account_name: acct?.name ?? "?", currency: acct?.currency ?? "KRW" };
    });
  }, [balances, accounts]);

  const chartData = useMemo(() => {
    if (!balancesWithAccount.length) return [];
    const byDate = new Map<string, number>();
    const sorted = [...balancesWithAccount].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    for (const b of sorted) {
      const current = byDate.get(b.date) ?? 0;
      byDate.set(b.date, current + b.balance);
    }
    return Array.from(byDate.entries()).map(([date, total]) => ({ date, total }));
  }, [balancesWithAccount]);

  const handleDelete = async (id: number) => {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/bank-balances?id=${id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">포트폴리오</div>
          <h1>{t("title")}</h1>
        </div>
        <div className="right">
          <button
            className="btn btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={bankAccounts.length === 0}
          >
            <Plus className="h-4 w-4" />
            {t("addBalance")}
          </button>
        </div>
      </div>

      {bankAccounts.length === 0 && (
        <div className="card">
          <div className="card-body card-body-padded py-12 text-center text-muted-foreground">
            {t("noAccounts")}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card">
          <div className="card-head"><div><h3 className="card-title">{t("balanceTrend")}</h3></div></div>
          <div className="card-body card-body-padded">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(new Date(v), "MM/dd")}
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v) => formatKRW(v)}
                  className="text-xs"
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [formatKRW(value as number), t("balance")]}
                  labelFormatter={(label) => format(new Date(label), "yyyy-MM-dd")}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {balancesWithAccount.length > 0 && (
        <div className="card">
          <div className="card-head"><div><h3 className="card-title">{t("history")}</h3></div></div>
          <div className="card-body">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tCommon("date")}</TableHead>
                  <TableHead>{t("account")}</TableHead>
                  <TableHead className="text-right">{t("balance")}</TableHead>
                  <TableHead>{tCommon("note")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {balancesWithAccount.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.date}</TableCell>
                    <TableCell>
                      {b.account_name}
                      <span className="badge ml-2 text-xs">
                        {b.currency}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      <Money value={b.balance} currency={b.currency} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.note}</TableCell>
                    <TableCell>
                      <button
                        className="btn btn-ghost btn-icon text-destructive"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {accounts && (
        <BankBalanceForm
          accounts={accounts}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={() => mutate()}
        />
      )}
    </div>
  );
}
