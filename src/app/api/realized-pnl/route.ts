import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";
import { getExchangeRateForDate } from "@/lib/exchange-rate";
import type { RealizedPnlSummary, RealizedPnlTx, RealizedPnlByTicker } from "@/types";

interface SellRow {
  id: number;
  ticker: string;
  name: string;
  currency: string;
  date: string;
  quantity: number | null;
  quantity_enc: string | null;
  price: number | null;
  price_enc: string | null;
  fees: number | null;
  fees_enc: string | null;
  fx_rate: number | null;
  realized_pnl_enc: string | null;
  avg_cost_at_sale_enc: string | null;
}

interface BuyRow {
  quantity: number | null;
  quantity_enc: string | null;
  price: number | null;
  price_enc: string | null;
}

const dec = (enc: string | null, raw: number | null): number =>
  enc ? (decryptNum(enc) ?? 0) : (raw ?? 0);

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");

  // 사용 가능한 연도 목록
  const yearRows = await sql`
    SELECT DISTINCT LEFT(t.date, 4) AS y
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.type = 'sell' AND a.user_id = ${user.id}
    ORDER BY y DESC
  ` as { y: string }[];
  const years = yearRows.map(r => Number(r.y)).filter(Boolean);

  const year = Number(yearParam) || years[0] || new Date().getFullYear();

  const sells = await sql`
    SELECT t.id, t.ticker, t.name, t.currency, t.date,
           t.quantity, t.quantity_enc, t.price, t.price_enc, t.fees, t.fees_enc,
           t.fx_rate, t.realized_pnl_enc, t.avg_cost_at_sale_enc
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.type = 'sell'
      AND t.date >= ${`${year}-01-01`}
      AND t.date <= ${`${year}-12-31`}
      AND a.user_id = ${user.id}
    ORDER BY t.date ASC, t.id ASC
  ` as SellRow[];

  const txs: RealizedPnlTx[] = [];

  for (const s of sells) {
    const qty = dec(s.quantity_enc, s.quantity);
    const price = dec(s.price_enc, s.price);
    const fees = dec(s.fees_enc, s.fees);

    // 실현손익(거래 통화): 저장값 우선, 없으면 이전 매수 가중평균으로 폴백 계산
    let realized: number;
    let avgCost: number;
    if (s.realized_pnl_enc) {
      realized = decryptNum(s.realized_pnl_enc) ?? 0;
      avgCost = s.avg_cost_at_sale_enc ? (decryptNum(s.avg_cost_at_sale_enc) ?? 0) : (qty > 0 ? price - (realized + fees) / qty : 0);
    } else {
      const buyRaw = await sql`
        SELECT t.quantity, t.quantity_enc, t.price, t.price_enc FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.ticker = ${s.ticker} AND t.type = 'buy'
          AND t.date <= ${s.date} AND t.id < ${s.id} AND a.user_id = ${user.id}
        ORDER BY t.date ASC
      ` as BuyRow[];
      const totalQty = buyRaw.reduce((acc, b) => acc + dec(b.quantity_enc, b.quantity), 0);
      const totalCost = buyRaw.reduce((acc, b) => acc + dec(b.quantity_enc, b.quantity) * dec(b.price_enc, b.price), 0);
      avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      realized = (price - avgCost) * qty - fees;
    }

    const fx = s.fx_rate ?? (s.currency === "USD" ? await getExchangeRateForDate(s.date) : 1);
    const realizedKrw = realized * fx;

    txs.push({
      id: s.id,
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      date: s.date,
      quantity: qty,
      sell_price: price,
      avg_cost: avgCost,
      realized,
      realized_krw: realizedKrw,
    });
  }

  // 종목별 집계
  const byTickerMap = new Map<string, RealizedPnlByTicker>();
  for (const t of txs) {
    const key = `${t.ticker}|${t.currency}`;
    const cur = byTickerMap.get(key) ?? {
      ticker: t.ticker, name: t.name, currency: t.currency,
      realized: 0, realized_krw: 0, count: 0,
    };
    cur.realized += t.realized;
    cur.realized_krw += t.realized_krw;
    cur.count += 1;
    byTickerMap.set(key, cur);
  }
  const byTicker = Array.from(byTickerMap.values()).sort((a, b) => b.realized_krw - a.realized_krw);

  const totalKrw = txs.reduce((acc, t) => acc + t.realized_krw, 0);
  const byCurrency: Record<string, number> = {};
  for (const t of txs) byCurrency[t.currency] = (byCurrency[t.currency] ?? 0) + t.realized;

  const summary: RealizedPnlSummary = {
    year,
    years,
    total_krw: totalKrw,
    by_currency: byCurrency,
    by_ticker: byTicker,
    transactions: txs,
  };

  return NextResponse.json(summary);
}
