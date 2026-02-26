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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StockSearchResult } from "@/app/api/stocks/search/route";

interface HoldingData {
  id?: number;
  account_id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  note?: string;
  manual_price?: number | null;
  date?: string;
}

interface Props {
  holding?: HoldingData | null;
  accountId: number;
  currency: string;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function HoldingForm({ holding, accountId, currency, open, onClose, onSave }: Props) {
  const t = useTranslations("HoldingForm");
  const tCommon = useTranslations("Common");
  const [ticker, setTicker] = useState(holding?.ticker ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [quantity, setQuantity] = useState(holding?.quantity?.toString() ?? "");
  const [avgCost, setAvgCost] = useState(holding?.avg_cost?.toString() ?? "");
  const [note, setNote] = useState(holding?.note ?? "");
  const [useManualPrice, setUseManualPrice] = useState(holding?.manual_price != null);
  const [manualPrice, setManualPrice] = useState(holding?.manual_price?.toString() ?? "");
  const [date, setDate] = useState(holding?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [sector, setSector] = useState("");
  const [annualDividend, setAnnualDividend] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTicker(holding?.ticker ?? "");
      setName(holding?.name ?? "");
      setQuantity(holding?.quantity?.toString() ?? "");
      setAvgCost(holding?.avg_cost?.toString() ?? "");
      setNote(holding?.note ?? "");
      setUseManualPrice(holding?.manual_price != null);
      setManualPrice(holding?.manual_price?.toString() ?? "");
      setDate(holding?.date ?? format(new Date(), "yyyy-MM-dd"));
      setSector("");
      setAnnualDividend("");
      setFetchingMeta(false);
      if (holding?.ticker) {
        fetch(`/api/stock-metadata?ticker=${holding.ticker}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.sector) setSector(data.sector);
            if (data.annual_dividend) setAnnualDividend(data.annual_dividend.toString());
          })
          .catch(() => {});
      }
    }
  }, [open, holding]);

  const handleStockSelect = (result: StockSearchResult) => {
    setTicker(result.ticker);
    setName(result.name);
  };

  const handleAutoFetchMeta = async () => {
    const t_ = ticker.trim();
    if (!t_) return;
    setFetchingMeta(true);
    try {
      const res = await fetch(`/api/stock-metadata?ticker=${t_}`);
      const data = await res.json();
      if (data.sector) setSector(data.sector);
      if (data.annual_dividend) setAnnualDividend(data.annual_dividend.toString());
    } catch {
      // ignore
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const body = {
      id: holding?.id,
      account_id: accountId,
      ticker: ticker.trim(),
      name: name.trim(),
      quantity: parseFloat(quantity) || 0,
      avg_cost: parseFloat(avgCost) || 0,
      currency,
      note: note.trim(),
      manual_price: useManualPrice && manualPrice ? parseFloat(manualPrice) : null,
      date,
    };

    await fetch("/api/holdings", {
      method: holding ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (sector.trim() || annualDividend) {
      await fetch("/api/stock-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: body.ticker,
          sector: sector.trim(),
          annual_dividend: parseFloat(annualDividend) || 0,
        }),
      });
    }

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holding ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>
            {holding ? t("editDescription") : t("addDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!holding ? (
            <div className="space-y-2">
              <Label>{t("search")}</Label>
              <StockSearchInput
                onSelect={handleStockSelect}
                placeholder="예: 삼성전자, 005930, AAPL, 비상장회사명"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">{t("tickerLabel")}</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="005930 또는 자유 입력"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdingName">{t("nameLabel")}</Label>
              <Input
                id="holdingName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="삼성전자"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avgCost">{t("avgCost")} ({currency})</Label>
              <Input
                id="avgCost"
                type="number"
                step="any"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useManualPrice}
                onChange={(e) => {
                  setUseManualPrice(e.target.checked);
                  if (!e.target.checked) setManualPrice("");
                }}
                className="h-4 w-4 rounded"
              />
              <span className="font-medium">{t("manualToggle")}</span>
              <span className="text-muted-foreground">{t("manualLabel")}</span>
            </label>
            {useManualPrice && (
              <div className="space-y-1">
                <Label htmlFor="manualPrice">{t("manualNote")} ({currency})</Label>
                <Input
                  id="manualPrice"
                  type="number"
                  step="any"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={t("manualPlaceholder")}
                  required={useManualPrice}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t("dateLabel")}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">{t("noteLabel")}</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                maxLength={100}
              />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-sm font-medium">{t("extraInfo")}</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sector">{t("sector")}</Label>
                <div className="flex gap-1">
                  <Input
                    id="sector"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder={t("sectorPlaceholder")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="annualDividend">{t("annualDividend")}</Label>
                <Input
                  id="annualDividend"
                  type="number"
                  step="any"
                  value={annualDividend}
                  onChange={(e) => setAnnualDividend(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFetchMeta}
              disabled={fetchingMeta || !ticker}
            >
              {fetchingMeta ? t("fetching") : t("autoFetch")}
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={saving || !ticker || !name}>
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
