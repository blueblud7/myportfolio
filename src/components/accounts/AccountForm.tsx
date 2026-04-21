"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAccounts } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Account } from "@/types";

interface Props {
  account?: Account | null;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function AccountForm({ account, open, onClose, onSave }: Props) {
  const t = useTranslations("AccountForm");
  const tCommon = useTranslations("Common");
  const { data: accounts } = useAccounts();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState(account?.type ?? "stock");
  const [currency, setCurrency] = useState(account?.currency ?? "KRW");
  const [broker, setBroker] = useState(account?.broker ?? "");
  const [owner, setOwner] = useState(account?.owner ?? "");
  const [saving, setSaving] = useState(false);

  const existingOwners = useMemo(() => {
    if (!Array.isArray(accounts)) return [];
    const set = new Set<string>();
    for (const a of accounts) if (a.owner) set.add(a.owner);
    return Array.from(set).sort();
  }, [accounts]);

  useEffect(() => {
    if (open) {
      setName(account?.name ?? "");
      setType(account?.type ?? "stock");
      setCurrency(account?.currency ?? "KRW");
      setBroker(account?.broker ?? "");
      setOwner(account?.owner ?? "");
    }
  }, [open, account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const body = { id: account?.id, name, type, currency, broker, owner: owner.trim() || null };
    await fetch("/api/accounts", {
      method: account ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 한국투자증권"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={type} onValueChange={(v: "stock" | "bank") => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">{t("stock")}</SelectItem>
                  <SelectItem value="bank">{t("bank")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={(v: "KRW" | "USD") => setCurrency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRW">{t("krw")}</SelectItem>
                  <SelectItem value="USD">{t("usd")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker">{t("broker")}</Label>
            <Input
              id="broker"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder={t("brokerPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner">소유자</Label>
            <Input
              id="owner"
              list="account-owners"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="예: 본인, 배우자 (비워두면 '미지정')"
            />
            <datalist id="account-owners">
              {existingOwners.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
