"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccounts, useExchangeRate } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/accounts/AccountForm";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import type { Account } from "@/types";

export default function AccountsPage() {
  const { data: accounts, mutate } = useAccounts();
  const { data: exchangeRateData } = useExchangeRate();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("이 계좌를 삭제하시겠습니까? 모든 보유종목도 함께 삭제됩니다.")) return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">계좌 관리</h1>
        <Button onClick={() => { setEditingAccount(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          새 계좌
        </Button>
      </div>

      {!accounts || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            등록된 계좌가 없습니다. 새 계좌를 추가해주세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="relative">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="outline">
                      {account.type === "stock" ? "주식" : "은행"}
                    </Badge>
                    <Badge variant="secondary">{account.currency}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingAccount(account);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {account.broker && (
                  <p className="mb-3 text-sm text-muted-foreground">{account.broker}</p>
                )}
                <Link href={`/accounts/${account.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    상세 보기
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccountForm
        account={editingAccount}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={() => mutate()}
      />
    </div>
  );
}
