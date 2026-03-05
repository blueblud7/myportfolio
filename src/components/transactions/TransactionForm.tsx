"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StockSearchInput } from "@/components/ui/stock-search-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Transaction, TransactionType } from "@/types";
import type { StockSearchResult } from "@/app/api/stocks/search/route";

interface Props {
  transaction?: Transaction | null;
  accountId: number;
  accountCurrency?: string;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function TransactionForm({ transaction, accountId, accountCurrency = "KRW", open, onClose, onSave }: Props) {
  const t = useTranslations("Transactions");
  const tCommon = useTranslations("Common");

  const [type, setType] = useState<TransactionType>(transaction?.type ?? "buy");
  const [ticker, setTicker] = useState(transaction?.ticker ?? "");
  const [name, setName] = useState(transaction?.name ?? "");
  const [quantity, setQuantity] = useState(transaction?.quantity?.toString() ?? "");
  const [price, setPrice] = useState(transaction?.price?.toString() ?? "");
  const [fees, setFees] = useState(transaction?.fees?.toString() ?? "0");
  const [currency, setCurrency] = useState<"KRW" | "USD">((transaction?.currency ?? accountCurrency) as "KRW" | "USD");
  const [date, setDate] = useState(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState(transaction?.note ?? "");
  const [saving, setSaving] = useState(false);

  const isEditing = !!transaction;
  const hideTicker = type === "deposit" || type === "withdrawal";
  const hideQuantity = type === "dividend" || type === "deposit" || type === "withdrawal";

  const qty = parseFloat(quantity) || 0;
  const prc = parseFloat(price) || 0;
  const feeVal = parseFloat(fees) || 0;
  const totalAmount = type === "deposit" || type === "withdrawal" ? prc : qty * prc + feeVal;

  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? "buy");
      setTicker(transaction?.ticker ?? "");
      setName(transaction?.name ?? "");
      setQuantity(transaction?.quantity?.toString() ?? "");
      setPrice(transaction?.price?.toString() ?? "");
      setFees(transaction?.fees?.toString() ?? "0");
      setCurrency((transaction?.currency ?? accountCurrency) as "KRW" | "USD");
      setDate(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
      setNote(transaction?.note ?? "");
    }
  }, [open, transaction, accountCurrency]);

  const handleStockSelect = (result: StockSearchResult) => {
    setTicker(result.ticker);
    setName(result.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const body = {
      id: transaction?.id,
      account_id: accountId,
      type,
      ticker: hideTicker ? "" : ticker.trim(),
      name: hideTicker ? "" : name.trim(),
      quantity: hideQuantity ? 0 : qty,
      price: prc,
      fees: feeVal,
      total_amount: totalAmount,
      currency,
      date,
      note: note.trim(),
    };

    await fetch("/api/transactions", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    onSave();
    onClose();
  };

  const TYPES: TransactionType[] = ["buy", "sell", "dividend", "deposit", "withdrawal"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editTransaction") : t("addTransaction")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 거래 유형 + 통화 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as TransactionType)} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>{t(tp)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "KRW" | "USD")} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRW">KRW</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 종목 검색 (deposit/withdrawal 제외) */}
          {!hideTicker && !isEditing && (
            <div className="space-y-2">
              <Label>{t("ticker")} / {t("name")}</Label>
              <StockSearchInput
                onSelect={handleStockSelect}
                placeholder={t("stockSearchPlaceholder")}
              />
            </div>
          )}

          {!hideTicker && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-ticker">{t("ticker")}</Label>
                <Input
                  id="tx-ticker"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder={t("tickerPlaceholder")}
                  disabled={isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-name">{t("name")}</Label>
                <Input
                  id="tx-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  disabled={isEditing}
                />
              </div>
            </div>
          )}

          {/* 수량 + 거래가 */}
          <div className="grid grid-cols-2 gap-4">
            {!hideQuantity && (
              <div className="space-y-2">
                <Label htmlFor="tx-quantity">{t("quantity")}</Label>
                <Input
                  id="tx-quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  disabled={isEditing}
                  required={!hideQuantity}
                />
              </div>
            )}
            <div className={`space-y-2 ${hideQuantity ? "col-span-2" : ""}`}>
              <Label htmlFor="tx-price">{t("price")} ({currency})</Label>
              <Input
                id="tx-price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                disabled={isEditing}
                required
              />
            </div>
          </div>

          {/* 수수료 (deposit/withdrawal/dividend 제외) */}
          {type !== "deposit" && type !== "withdrawal" && type !== "dividend" && (
            <div className="space-y-2">
              <Label htmlFor="tx-fees">{t("fees")} ({currency})</Label>
              <Input
                id="tx-fees"
                type="number"
                step="any"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0"
                disabled={isEditing}
              />
            </div>
          )}

          {/* 총액 표시 */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm flex justify-between items-center">
            <span className="text-muted-foreground">{t("totalAmount")}</span>
            <span className="font-mono font-medium">
              {totalAmount.toLocaleString()} {currency}
            </span>
          </div>

          {/* 날짜 + 메모 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tx-date">{t("date")}</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-note">{t("note")}</Label>
              <Input
                id="tx-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                maxLength={100}
              />
            </div>
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
