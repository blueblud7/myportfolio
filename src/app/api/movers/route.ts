import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol, isKoreanTicker } from "@/lib/ticker-resolver";
import { decryptNum } from "@/lib/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export type MoverSignal = "up5" | "up3" | "down3" | "down5" | "vol_spike" | "high52" | "low52";

export interface MoverItem {
  ticker: string;
  name: string;
  changePct: number;
  price: number;
  currency: string;
  signals: MoverSignal[];
}

export interface MoversResponse {
  movers: MoverItem[];
  date: string;
}

// 3초 타임아웃으로 Yahoo Finance 부가 정보 fetch
async function enrichWithYahoo(tickers: string[]): Promise<Map<string, { volSpike: boolean; high52: boolean; low52: boolean }>> {
  const result = new Map<string, { volSpike: boolean; high52: boolean; low52: boolean }>();
  if (tickers.length === 0) return result;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 3000)
  );

  try {
    await Promise.race([
      Promise.allSettled(
        tickers.map(async (ticker) => {
          try {
            const symbol = isKoreanTicker(ticker)
              ? `${ticker}.KS`
              : resolveYahooSymbol(ticker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const q: any = await yf.quote(symbol);
            const price: number = q?.regularMarketPrice ?? 0;
            const vol: number = q?.regularMarketVolume ?? 0;
            const avgVol: number = q?.averageDailyVolume10Day ?? q?.averageDailyVolume3Month ?? 0;
            const high52: number = q?.fiftyTwoWeekHigh ?? 0;
            const low52: number = q?.fiftyTwoWeekLow ?? 0;

            result.set(ticker, {
              volSpike: avgVol > 0 && vol >= avgVol * 2,
              high52: high52 > 0 && price >= high52 * 0.99,
              low52: low52 > 0 && price <= low52 * 1.01,
            });
          } catch { /* skip */ }
        })
      ),
      timeout,
    ]);
  } catch { /* timeout — return what we have */ }

  return result;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const today = new Date().toISOString().split("T")[0];

  type Row = { ticker: string; name: string; currency: string; change_pct: string | null; price: string };
  const rows = await sql`
    SELECT DISTINCT ON (h.ticker)
      h.ticker, h.name, h.currency, h.quantity, h.quantity_enc,
      ph.change_pct, ph.price
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    JOIN price_history ph ON h.ticker = ph.ticker
    WHERE a.type = 'stock'
      AND a.user_id = ${user.id}
      AND h.ticker != 'CASH'
      AND ph.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    ORDER BY h.ticker, ph.date DESC
  ` as unknown as (Row & { quantity: number | null; quantity_enc: string | null })[];

  // 암호화된 quantity 복호화 후 quantity > 0 필터
  const filteredByQty = (rows as (Row & { quantity: number | null; quantity_enc: string | null })[]).filter(r => {
    const q = r.quantity_enc ? (decryptNum(r.quantity_enc) ?? 0) : (r.quantity ?? 0);
    return q > 0;
  });
  rows.length = 0;
  rows.push(...filteredByQty);

  // 의미있는 움직임만 필터 (|%| >= 2)
  const significant = rows.filter((r) => r.change_pct !== null && Math.abs(Number(r.change_pct)) >= 2);
  const tickers = significant.map((r) => r.ticker);

  const enriched = await enrichWithYahoo(tickers);

  const movers: MoverItem[] = significant
    .map((r) => {
      const changePct = Number(r.change_pct);
      const signals: MoverSignal[] = [];

      if (changePct >= 5)       signals.push("up5");
      else if (changePct >= 3)  signals.push("up3");
      if (changePct <= -5)      signals.push("down5");
      else if (changePct <= -3) signals.push("down3");

      const extra = enriched.get(r.ticker);
      if (extra?.volSpike) signals.push("vol_spike");
      if (extra?.high52)   signals.push("high52");
      if (extra?.low52)    signals.push("low52");

      return {
        ticker: r.ticker,
        name: r.name,
        changePct,
        price: Number(r.price),
        currency: r.currency,
        signals,
      };
    })
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const data: MoversResponse = { movers, date: today };
  return NextResponse.json(data);
}
