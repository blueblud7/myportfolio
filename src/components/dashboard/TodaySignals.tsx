"use client";

import { useEffect, useState } from "react";
import type { MoverItem, MoverSignal } from "@/app/api/movers/route";
import type { MarketMoverItem, MarketMoversResponse } from "@/app/api/market-movers/route";

// 한국 데이터 기준일 라벨. KRX EOD(YYYYMMDD)면 "MM/DD 기준", 라이브 폴백(null)이면 "실시간".
function fmtKrBasis(krDate: string | null): string {
  if (!krDate || krDate.length !== 8) return "실시간";
  return `${krDate.slice(4, 6)}/${krDate.slice(6, 8)} 기준`;
}

const SIGNAL_META: Record<MoverSignal, { label: string; tone: string }> = {
  up5:       { label: "+5%↑",    tone: "up" },
  up3:       { label: "+3%↑",    tone: "up" },
  down3:     { label: "-3%↓",    tone: "down" },
  down5:     { label: "-5%↓",    tone: "down" },
  vol_spike: { label: "거래량 2x", tone: "warn" },
  high52:    { label: "52주 고가", tone: "accent" },
  low52:     { label: "52주 저가", tone: "neutral" },
};

function PortfolioMoverRow({ item }: { item: MoverItem }) {
  const isUp = item.changePct >= 0;
  const extras = item.signals.filter((s) => !["up3", "down3", "up5", "down5"].includes(s));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 40, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: isUp ? "var(--up)" : "var(--down)", flexShrink: 0 }}>
        {isUp ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(1)}%
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="ticker">{item.ticker}</span>
        <span className="ticker-name" style={{ marginLeft: 6 }}>{item.name}</span>
        {extras.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            {extras.map((s) => (
              <span key={s} className={`badge badge-${SIGNAL_META[s].tone}`}>{SIGNAL_META[s].label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketRow({ item, rank }: { item: MarketMoverItem; rank?: number }) {
  const isUp = item.changePct >= 0;
  const volRatio = item.avgVolume > 0 ? item.volume / item.avgVolume : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      {rank !== undefined && (
        <span style={{ width: 16, flexShrink: 0, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)" }}>{rank}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="ticker">{item.ticker}</span>
        <span className="ticker-name" style={{ marginLeft: 6 }}>{item.name}</span>
        {volRatio !== null && volRatio >= 1.5 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--warn)", marginLeft: 4 }}>
            {volRatio.toFixed(1)}x
          </span>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isUp ? "var(--up)" : "var(--down)", fontVariantNumeric: "tabular-nums" }}>
          {isUp ? "+" : ""}{item.changePct.toFixed(2)}%
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)" }}>
          {item.currency === "KRW"
            ? `₩${Math.round(item.price).toLocaleString("ko-KR")}`
            : `$${item.price.toFixed(item.price < 10 ? 3 : 2)}`}
        </div>
      </div>
    </div>
  );
}

function MarketSection({ title, items, emptyMsg }: { title: string; items: MarketMoverItem[]; emptyMsg: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="section-title"><span>{title}</span></div>
      {items.length === 0
        ? <p style={{ fontSize: 11, color: "var(--fg-4)", padding: "8px 0" }}>{emptyMsg}</p>
        : items.map((m, i) => <MarketRow key={m.ticker} item={m} rank={i + 1} />)
      }
    </div>
  );
}

type Tab = "portfolio" | "market";

export function TodaySignals() {
  const [tab, setTab] = useState<Tab>("market");
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [market, setMarket] = useState<MarketMoversResponse | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [portfolioDate, setPortfolioDate] = useState("");

  const loadPortfolio = async () => {
    setLoadingPortfolio(true);
    try {
      const res = await fetch("/api/movers");
      const data = await res.json();
      setMovers(data.movers ?? []);
      setPortfolioDate(data.date ?? "");
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const loadMarket = async () => {
    setLoadingMarket(true);
    try {
      const res = await fetch("/api/market-movers");
      setMarket(await res.json());
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    loadMarket();
    loadPortfolio();
  }, []);

  const gainers = movers.filter((m) => m.changePct >= 0);
  const losers  = movers.filter((m) => m.changePct < 0);
  const special = movers.filter((m) => m.signals.some((s) => ["vol_spike", "high52", "low52"].includes(s)));
  const loading = tab === "portfolio" ? loadingPortfolio : loadingMarket;

  // Spin icon
  const RefreshIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );

  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.8" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <h3 className="card-title">Today&#39;s Signals</h3>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="seg seg-sm">
            <button className={`seg-btn${tab === "market" ? " active" : ""}`} onClick={() => setTab("market")}>시장 전체</button>
            <button className={`seg-btn${tab === "portfolio" ? " active" : ""}`} onClick={() => setTab("portfolio")}>내 포트폴리오</button>
          </div>
          <button className="btn-ghost btn-icon btn" onClick={tab === "market" ? loadMarket : loadPortfolio}>
            {RefreshIcon}
          </button>
        </div>
      </div>

      <div className="card-body card-body-padded">
        {/* Market Tab */}
        {tab === "market" && (
          loadingMarket && !market ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: 36, borderRadius: "var(--radius)", background: "var(--bg-2)" }} />)}
            </div>
          ) : market ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gutter)" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "var(--fg-3)" }}>🇺🇸 미국</div>
                <MarketSection title="급등주" items={market.us.gainers} emptyMsg="데이터 없음" />
                <MarketSection title="급락주" items={market.us.losers} emptyMsg="데이터 없음" />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "var(--fg-3)" }}>🇰🇷 한국</div>
                <MarketSection title="급등주" items={market.kr.gainers} emptyMsg="데이터 없음" />
                <MarketSection title="급락주" items={market.kr.losers} emptyMsg="데이터 없음" />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "var(--fg-3)" }}>📊 거래량 상위</div>
                <MarketSection title="미국" items={market.us.active} emptyMsg="데이터 없음" />
                <MarketSection title="한국" items={market.kr.active} emptyMsg="데이터 없음" />
              </div>
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--fg-4)", fontSize: 13, padding: "24px 0" }}>데이터를 불러올 수 없습니다</p>
          )
        )}

        {/* Portfolio Tab */}
        {tab === "portfolio" && (
          loadingPortfolio && movers.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: 40, borderRadius: "var(--radius)", background: "var(--bg-2)" }} />)}
            </div>
          ) : movers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-4)" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>오늘 눈에 띄는 움직임 없음</div>
              <div style={{ fontSize: 11 }}>±2% 이상 변동 종목이 없습니다</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gutter)" }}>
              {gainers.length > 0 && (
                <div>
                  <div className="section-title"><span style={{ color: "var(--up)" }}>급등 {gainers.length}</span></div>
                  {gainers.slice(0, 5).map((m) => <PortfolioMoverRow key={m.ticker} item={m} />)}
                </div>
              )}
              {losers.length > 0 && (
                <div>
                  <div className="section-title"><span style={{ color: "var(--down)" }}>급락 {losers.length}</span></div>
                  {losers.slice(0, 5).map((m) => <PortfolioMoverRow key={m.ticker} item={m} />)}
                </div>
              )}
              {special.length > 0 && (
                <div>
                  <div className="section-title"><span style={{ color: "var(--warn)" }}>특이 시그널</span></div>
                  {special.slice(0, 5).map((m) => <PortfolioMoverRow key={m.ticker} item={m} />)}
                </div>
              )}
            </div>
          )
        )}

        {/* Footer */}
        <div style={{ marginTop: 12, fontSize: 10, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
          {tab === "market" && market &&
            `미국 실시간 · 한국 ${fmtKrBasis(market.krDate)} · 10분 캐시 · ${new Date(market.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트`}
          {tab === "portfolio" && portfolioDate && `${portfolioDate} 기준 · ±2% 이상 보유 종목`}
        </div>
      </div>
    </div>
  );
}
