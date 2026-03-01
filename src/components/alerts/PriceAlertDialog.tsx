"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface PriceAlert {
  id?: number;
  ticker: string;
  name: string;
  target_price: number;
  alert_type: "above" | "below";
  currency: "KRW" | "USD";
  note: string;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  alert?: PriceAlert | null;
  defaultTicker?: string;
  defaultName?: string;
  defaultCurrency?: "KRW" | "USD";
  onClose: () => void;
  onSave: () => void;
}

const defaultForm = (ticker = "", name = "", currency: "KRW" | "USD" = "USD"): PriceAlert => ({
  ticker,
  name,
  target_price: 0,
  alert_type: "above",
  currency,
  note: "",
});

export function PriceAlertDialog({
  open,
  alert,
  defaultTicker = "",
  defaultName = "",
  defaultCurrency = "USD",
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("Alerts");
  const tCommon = useTranslations("Common");
  const [form, setForm] = useState<PriceAlert>(
    defaultForm(defaultTicker, defaultName, defaultCurrency)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (alert) {
      setForm({
        id: alert.id,
        ticker: alert.ticker,
        name: alert.name,
        target_price: alert.target_price,
        alert_type: alert.alert_type,
        currency: alert.currency,
        note: alert.note,
        is_active: alert.is_active,
      });
    } else {
      setForm(defaultForm(defaultTicker, defaultName, defaultCurrency));
    }
  }, [alert, defaultTicker, defaultName, defaultCurrency, open]);

  const handleSave = async () => {
    if (!form.ticker || !form.target_price) return;
    setSaving(true);
    await fetch("/api/alerts", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: form.id }),
    });
    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{form.id ? t("editAlert") : t("addAlert")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("ticker")}</Label>
              <Input
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="AAPL"
                disabled={!!form.id}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("currency")}</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm((f) => ({ ...f, currency: v as "KRW" | "USD" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="KRW">KRW (원)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Apple Inc."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("alertType")}</Label>
              <Select
                value={form.alert_type}
                onValueChange={(v) => setForm((f) => ({ ...f, alert_type: v as "above" | "below" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">↑ {t("above")}</SelectItem>
                  <SelectItem value="below">↓ {t("below")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("targetPrice")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.target_price || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_price: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{tCommon("note")}</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder={t("notePlaceholder")}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.ticker || !form.target_price}
            >
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
