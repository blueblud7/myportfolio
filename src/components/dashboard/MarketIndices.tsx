"use client";

import useSWR from "swr";

interface IndexData {
  key: string;
  label: string;
  symbol: string;
  isYield: boolean;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  prevClose: number | null;
  oilSpread?: number | null;
  oilCurve?: "contango" | "backwardation" | null;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

function fmt(price: number, key: string) {
  if (key === "btc") return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "kospi") return price.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function prefix(key: string, currency: string) {
  if (key === "kospi") return "";
  if (currency === "USD") return "$";
  return "";
}

export function MarketIndices() {
  const { data, isLoading } = useSWR<IndexData[]>("/api/market-indices", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="scrollbar-hide">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ height: 64, minWidth: 110, borderRadius: "var(--radius-lg)", background: "var(--bg-2)", border: "1px solid var(--border)", flexShrink: 0 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }} className="scrollbar-hide">
      {data.map((idx, i) => {
        const chg = idx.changePct ?? 0;
        const up = chg > 0;
        const down = chg < 0;
        const color = up ? "var(--up)" : down ? "var(--down)" : "var(--fg-3)";

        let valueStr = "—";
        let changeStr = "";

        if (idx.price != null) {
          if (idx.isYield) {
            const bps = idx.change != null ? Math.round(idx.change * 100 * 10) / 10 : null;
            valueStr = `${idx.price.toFixed(2)}%`;
            changeStr = bps != null ? `${bps > 0 ? "+" : ""}${bps}bps` : "";
          } else {
            valueStr = `${prefix(idx.key, idx.currency)}${fmt(idx.price, idx.key)}`;
            changeStr = `${up ? "+" : ""}${chg.toFixed(2)}%`;
            if (idx.key === "wti" && idx.oilCurve) {
              changeStr += " · " + (idx.oilCurve === "contango" ? "콘탱고" : "백워데이션");
            }
          }
        }

        return (
          <div
            key={idx.key}
            className="tape-cell"
            style={{ minWidth: idx.key === "wti" ? 150 : 120, borderRight: i < data.length - 1 ? "1px solid var(--border)" : "none", flexShrink: 0 }}
          >
            <div className="name">{idx.label}</div>
            <div className="value" style={{ fontSize: 15 }}>{valueStr}</div>
            <div style={{ color, fontFamily: "var(--font-mono)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              {up ? "▲" : down ? "▼" : "·"} {changeStr}
            </div>
          </div>
        );
      })}
    </div>
  );
}
