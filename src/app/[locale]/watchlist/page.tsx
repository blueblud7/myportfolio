"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, Plus, Trash2, Pencil, RefreshCw, Check, X, LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockSearchInput } from "@/components/ui/stock-search-input";
import type { WatchlistItem } from "@/app/api/watchlist/route";
import type { FundamentalsResult } from "@/app/api/fundamentals/route";

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") return `₩${Math.round(price).toLocaleString("ko-KR")}`;
  return `$${price.toFixed(price < 10 ? 3 : 2)}`;
}

function WatchlistForm({
  item,
  onSave,
  onCancel,
}: {
  item?: WatchlistItem;
  onSave: (payload: Partial<WatchlistItem>) => Promise<void>;
  onCancel: () => void;
}) {
  const [ticker, setTicker] = useState(item?.ticker ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [currency, setCurrency] = useState<"USD" | "KRW">(item?.currency ?? "USD");
  const [buyPrice, setBuyPrice] = useState(item?.target_buy_price?.toString() ?? "");
  const [sellPrice, setSellPrice] = useState(item?.target_sell_price?.toString() ?? "");
  const [tags, setTags] = useState(item?.tags ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !name) {
      setError("종목 필수");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        ticker: ticker.trim().toUpperCase(),
        name: name.trim(),
        currency,
        target_buy_price: buyPrice ? parseFloat(buyPrice) : null,
        target_sell_price: sellPrice ? parseFloat(sellPrice) : null,
        tags: tags.trim(),
        note: note.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">종목</label>
          {item ? (
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
            />
          ) : (
            <div className="mt-1">
              <StockSearchInput
                onSelect={(r) => {
                  setTicker(r.ticker);
                  setName(r.name);
                  if (/^\d{6}$/.test(r.ticker)) setCurrency("KRW");
                  else setCurrency("USD");
                }}
              />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">종목명</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">통화</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "USD" | "KRW")}
            className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
          >
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">태그 (쉼표 구분)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="breakout, earnings"
            className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">목표 매수가 (선택)</label>
          <input
            type="number"
            step="any"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">목표 매도가 (선택)</label>
          <input
            type="number"
            step="any"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">메모</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="관심 이유, 관찰 포인트 등"
          className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {saving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 h-9 px-4 rounded-md border border-border text-sm hover:bg-muted/40"
        >
          <X className="h-4 w-4" /> 취소
        </button>
      </div>
    </form>
  );
}

function WatchRow({
  item,
  onEdit,
  onDelete,
}: {
  item: WatchlistItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasBuy = item.target_buy_price !== null;
  const hasSell = item.target_sell_price !== null;

  const buyGap =
    hasBuy && item.current_price > 0
      ? ((item.current_price - item.target_buy_price!) / item.target_buy_price!) * 100
      : null;
  const sellGap =
    hasSell && item.current_price > 0
      ? ((item.current_price - item.target_sell_price!) / item.target_sell_price!) * 100
      : null;

  const buyReached = hasBuy && item.current_price > 0 && item.current_price <= item.target_buy_price!;
  const sellReached = hasSell && item.current_price > 0 && item.current_price >= item.target_sell_price!;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 transition-colors",
        buyReached && "ring-2 ring-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-500/10",
        sellReached && "ring-2 ring-amber-500/60 bg-amber-50/50 dark:bg-amber-500/10"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{item.ticker}</span>
            <span className="text-sm text-muted-foreground truncate">{item.name}</span>
            {buyReached && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                매수가 도달
              </span>
            )}
            {sellReached && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">
                매도가 도달
              </span>
            )}
          </div>
          {item.tags && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {item.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">
            {item.current_price > 0 ? formatPrice(item.current_price, item.currency) : "—"}
          </p>
          {item.current_price > 0 && (
            <p
              className={cn(
                "text-xs tabular-nums",
                item.change_pct >= 0 ? "text-emerald-500" : "text-red-500"
              )}
            >
              {item.change_pct >= 0 ? "+" : ""}
              {item.change_pct.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      {(hasBuy || hasSell) && (
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
          {hasBuy && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">매수가</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatPrice(item.target_buy_price!, item.currency)}
              </p>
              {buyGap !== null && (
                <p
                  className={cn(
                    "text-[11px] tabular-nums",
                    buyGap <= 0 ? "text-emerald-500" : "text-muted-foreground"
                  )}
                >
                  현재가 {buyGap > 0 ? "+" : ""}
                  {buyGap.toFixed(1)}%
                </p>
              )}
            </div>
          )}
          {hasSell && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">매도가</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatPrice(item.target_sell_price!, item.currency)}
              </p>
              {sellGap !== null && (
                <p
                  className={cn(
                    "text-[11px] tabular-nums",
                    sellGap >= 0 ? "text-amber-500" : "text-muted-foreground"
                  )}
                >
                  현재가 {sellGap > 0 ? "+" : ""}
                  {sellGap.toFixed(1)}%
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {item.note && (
        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{item.note}</p>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={onEdit}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" /> 수정
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-500/70 hover:text-red-500 inline-flex items-center gap-1"
        >
          <Trash2 className="h-3 w-3" /> 삭제
        </button>
      </div>
    </div>
  );
}

function fmtNum(v: number | null, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function fiftyTwoWeekPosition(price: number, low: number, high: number): number | null {
  if (!low || !high || high === low) return null;
  return Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
}

function PerCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value <= 0) return <span className="text-muted-foreground text-xs">적자</span>;
  const cls = value < 10 ? "text-emerald-400" : value < 20 ? "" : value < 30 ? "text-amber-400" : "text-red-400";
  return <span className={cls}>{value.toFixed(1)}</span>;
}

function PbrCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value <= 0) return <span className="text-muted-foreground">—</span>;
  const cls = value < 0.8 ? "text-emerald-400" : value < 1.5 ? "" : value < 3 ? "text-amber-400" : "text-red-400";
  return <span className={cls}>{value.toFixed(2)}</span>;
}

function RangeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = pct >= 85 ? "bg-red-500" : pct >= 50 ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="relative h-1.5 flex-1 rounded-full bg-zinc-700/50">
        <div className={cn("absolute left-0 h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono tabular-nums w-7 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function CompareTable({ items, funds }: { items: WatchlistItem[]; funds: Record<string, FundamentalsResult | undefined> }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">펀더멘털 가로비교</span>
        <span className="text-xs text-muted-foreground">{items.length}개 종목 · Yahoo Finance</span>
      </div>
      <div className="card-body">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left">종목</th>
                <th className="px-3 py-2 text-right">현재가</th>
                <th className="px-3 py-2 text-right">등락률</th>
                <th className="px-3 py-2 text-left">52주 위치</th>
                <th className="px-3 py-2 text-right">Trailing PER</th>
                <th className="px-3 py-2 text-right">Forward PER</th>
                <th className="px-3 py-2 text-right">PBR</th>
                <th className="px-3 py-2 text-right">EPS (TTM)</th>
                <th className="px-3 py-2 text-right">Fwd EPS</th>
                <th className="px-3 py-2 text-right">매출 성장</th>
                <th className="px-3 py-2 text-right">영업이익률</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const f = funds[item.ticker];
                const pos = f ? fiftyTwoWeekPosition(f.price, f.fiftyTwoWeekLow, f.fiftyTwoWeekHigh) : null;
                return (
                  <tr key={item.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <a href={`/stocks/${item.ticker}`} className="hover:text-accent transition-colors">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{item.ticker}</div>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {item.current_price > 0 ? formatPrice(item.current_price, item.currency) : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums font-semibold",
                      item.change_pct > 0 ? "text-emerald-400" : item.change_pct < 0 ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {item.change_pct >= 0 ? "+" : ""}{item.change_pct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2"><RangeBar pct={pos} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums"><PerCell value={f?.trailingPE ?? null} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums"><PerCell value={f?.forwardPE ?? null} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums"><PbrCell value={f?.priceToBook ?? null} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtNum(f?.trailingEps ?? null)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtNum(f?.forwardEps ?? null)}</td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums",
                      (f?.revenueGrowth ?? 0) > 0 ? "text-emerald-400" : (f?.revenueGrowth ?? 0) < 0 ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {f?.revenueGrowth != null ? `${f.revenueGrowth > 0 ? "+" : ""}${f.revenueGrowth.toFixed(1)}%` : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums",
                      (f?.operatingMargins ?? 0) > 10 ? "text-emerald-400" : (f?.operatingMargins ?? 0) < 0 ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {f?.operatingMargins != null ? `${f.operatingMargins.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border/40">
          PER 10미만(초록) · 10–20(기본) · 20–30(주황) · 30+(빨강) / PBR 0.8미만(초록) · 0.8–1.5(기본) · 1.5–3(주황) · 3+(빨강)
        </p>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [view, setView] = useState<"card" | "compare">("card");
  const [funds, setFunds] = useState<Record<string, FundamentalsResult | undefined>>({});
  const [fundsLoading, setFundsLoading] = useState(false);

  const tickersKey = useMemo(() => items.map(i => i.ticker).sort().join(","), [items]);

  useEffect(() => {
    if (view !== "compare" || items.length === 0) return;
    const tickers = items.map(i => i.ticker).filter(t => t !== "CASH").slice(0, 20);
    if (tickers.length === 0) return;
    setFundsLoading(true);
    fetch(`/api/fundamentals?tickers=${tickers.join(",")}`)
      .then(r => r.json())
      .then((data: FundamentalsResult[]) => {
        const map: Record<string, FundamentalsResult> = {};
        for (const f of data) map[f.ticker] = f;
        setFunds(map);
      })
      .catch(() => {})
      .finally(() => setFundsLoading(false));
  }, [view, tickersKey, items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (payload: Partial<WatchlistItem>) => {
    const method = editingItem ? "PUT" : "POST";
    const body = editingItem ? { ...payload, id: editingItem.id } : payload;
    const res = await fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "저장 실패");
    }
    setShowForm(false);
    setEditingItem(null);
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    await load();
  };

  const handleRefresh = async () => {
    if (items.length === 0) return;
    setRefreshing(true);
    try {
      await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: items.map((i) => i.ticker) }),
      });
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">포트폴리오</div>
          <h1>워치리스트</h1>
        </div>
        <div className="right">
          {items.length > 0 && <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>{items.length}개 관심 종목</span>}
          <div className="seg seg-sm">
            <button className={cn("seg-btn", view === "card" && "active")} onClick={() => setView("card")}>
              <LayoutGrid className="h-3.5 w-3.5" />
              카드
            </button>
            <button className={cn("seg-btn", view === "compare" && "active")} onClick={() => setView("compare")}>
              <Table2 className="h-3.5 w-3.5" />
              비교
            </button>
          </div>
          <button className="btn" onClick={handleRefresh} disabled={refreshing || items.length === 0}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            가격 갱신
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingItem(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> 추가
          </button>
        </div>
      </div>

      {showForm && (
        <WatchlistForm
          item={editingItem ?? undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
        />
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Eye className="h-10 w-10 opacity-20" />
          <p className="text-sm">관심 종목이 없습니다</p>
        </div>
      ) : view === "compare" ? (
        fundsLoading && Object.keys(funds).length === 0 ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />)}
          </div>
        ) : (
          <CompareTable items={items} funds={funds} />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item) => (
            <WatchRow
              key={item.id}
              item={item}
              onEdit={() => {
                setEditingItem(item);
                setShowForm(true);
              }}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
