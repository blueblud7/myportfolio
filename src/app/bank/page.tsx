"use client";

import { useState, useMemo } from "react";
import { useAccounts, useBankBalances } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, formatKRW } from "@/lib/format";
import { format } from "date-fns";
import type { Account } from "@/types";

export default function BankPage() {
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
    if (!confirm("이 잔고 기록을 삭제하시겠습니까?")) return;
    await fetch(`/api/bank-balances?id=${id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">은행 계좌</h1>
        <Button
          onClick={() => setFormOpen(true)}
          disabled={bankAccounts.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          잔고 입력
        </Button>
      </div>

      {bankAccounts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            은행 계좌가 없습니다. 계좌 관리에서 은행 계좌를 먼저 추가해주세요.
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>잔고 추이</CardTitle>
          </CardHeader>
          <CardContent>
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
                  formatter={(value) => [formatKRW(value as number), "잔고"]}
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
          </CardContent>
        </Card>
      )}

      {balancesWithAccount.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>잔고 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>계좌</TableHead>
                  <TableHead className="text-right">잔고</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {balancesWithAccount.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.date}</TableCell>
                    <TableCell>
                      {b.account_name}
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {b.currency}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(b.balance, b.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.note}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
