"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HoldingData {
  id?: number;
  account_id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  currency: string;
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
  const [ticker, setTicker] = useState(holding?.ticker ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [quantity, setQuantity] = useState(holding?.quantity?.toString() ?? "");
  const [avgCost, setAvgCost] = useState(holding?.avg_cost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

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
    };

    await fetch("/api/holdings", {
      method: holding ? "PUT" : "POST",
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
          <DialogTitle>{holding ? "종목 수정" : "종목 추가"}</DialogTitle>
          <DialogDescription>종목 정보를 입력해주세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">티커</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="예: 005930 또는 AAPL"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdingName">종목명</Label>
              <Input
                id="holdingName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 삼성전자"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">수량</Label>
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
              <Label htmlFor="avgCost">평균 매입가 ({currency})</Label>
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
