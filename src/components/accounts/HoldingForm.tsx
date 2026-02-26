"use client";

import { useState } from "react";
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

  const handleStockSelect = (result: StockSearchResult) => {
    setTicker(result.ticker);
    setName(result.name);
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
          <DialogDescription>종목명 또는 종목코드로 검색하세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 종목 검색 (수정 모드에서는 기존 값 표시) */}
          {!holding ? (
            <div className="space-y-2">
              <Label>종목 검색</Label>
              <StockSearchInput
                onSelect={handleStockSelect}
                placeholder="예: 삼성전자, 005930, AAPL, Apple"
              />
            </div>
          ) : null}

          {/* 선택된 종목 정보 (또는 직접 입력) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">종목코드</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="005930"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdingName">종목명</Label>
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
            <Button type="submit" disabled={saving || !ticker || !name}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
