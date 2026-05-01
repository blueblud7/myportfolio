import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";
import type { CapitalGainsSummary, CapitalGainsTx, CapitalGainsHolding } from "@/types";

const DEDUCTION_KRW = 2_500_000; // 250만원 기본공제
const TAX_RATE = 0.22;           // 22% (지방세 포함)

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  const sql = getDb();
  const exchangeRate = await getCachedExchangeRate();

  // 해당 연도의 USD sell 거래 목록
  const sellTxs = await sql`
    SELECT t.id, t.ticker, t.name, t.quantity, t.price, t.date
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.type = 'sell'
      AND t.currency = 'USD'
      AND t.date >= ${`${year}-01-01`}
      AND t.date <= ${`${year}-12-31`}
      AND a.user_id = ${user.id}
    ORDER BY t.date ASC
  ` as { id: number; ticker: string; name: string; quantity: number; price: number; date: string }[];

  // 각 sell 거래의 avg_cost 계산: 해당 거래 이전까지의 buy 거래들의 가중평균
  const txResults: CapitalGainsTx[] = [];

  for (const sell of sellTxs) {
    // 이 sell 거래 이전의 buy 거래들로 avg_cost 계산
    const buys = await sql`
      SELECT t.quantity, t.price FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.ticker = ${sell.ticker}
        AND t.currency = 'USD'
        AND t.type = 'buy'
        AND t.date <= ${sell.date}
        AND t.id < ${sell.id}
        AND a.user_id = ${user.id}
      ORDER BY t.date ASC
    ` as { quantity: number; price: number }[];

    let avgCost = 0;
    if (buys.length > 0) {
      const totalQty = buys.reduce((s, b) => s + b.quantity, 0);
      const totalCost = buys.reduce((s, b) => s + b.quantity * b.price, 0);
      avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    } else {
      // buy 기록이 없으면 현재 holdings avg_cost 사용
      const holding = await sql`
        SELECT h.avg_cost, h.avg_cost_enc FROM holdings h
        JOIN accounts a ON h.account_id = a.id
        WHERE h.ticker = ${sell.ticker} AND h.currency = 'USD' AND a.user_id = ${user.id}
        LIMIT 1
      ` as { avg_cost: number | null; avg_cost_enc: string | null }[];
      if (holding.length > 0) {
        const h = holding[0];
        avgCost = h.avg_cost_enc ? (decryptNum(h.avg_cost_enc) ?? 0) : (h.avg_cost ?? 0);
      } else {
        avgCost = 0;
      }
    }

    const realizedGainUsd = (sell.price - avgCost) * sell.quantity;
    const realizedGainKrw = realizedGainUsd * exchangeRate;

    txResults.push({
      ticker: sell.ticker,
      name: sell.name,
      date: sell.date,
      quantity: sell.quantity,
      sell_price: sell.price,
      avg_cost: avgCost,
      realized_gain_usd: realizedGainUsd,
      realized_gain_krw: realizedGainKrw,
    });
  }

  const totalRealizedUsd = txResults.reduce((s, t) => s + t.realized_gain_usd, 0);
  const totalRealizedKrw = totalRealizedUsd * exchangeRate;
  const taxableKrw = Math.max(0, totalRealizedKrw - DEDUCTION_KRW);
  const taxKrw = taxableKrw * TAX_RATE;

  // 현재 보유 중인 USD 종목 (절세 시뮬레이션용)
  const holdingsRaw = await sql`
    SELECT h.id, h.ticker, h.name,
           h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE h.currency = 'USD'
      AND h.ticker != 'CASH'
      AND a.user_id = ${user.id}
    ORDER BY h.name
  ` as { id: number; ticker: string; name: string;
         quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         price_market: number }[];
  const holdings = holdingsRaw.map(h => {
    const qty = h.quantity_enc ? (decryptNum(h.quantity_enc) ?? 0) : (h.quantity ?? 0);
    const cost = h.avg_cost_enc ? (decryptNum(h.avg_cost_enc) ?? 0) : (h.avg_cost ?? 0);
    return { ...h, quantity: qty, avg_cost: cost, current_price: h.price_market || cost };
  });

  const usdHoldings: CapitalGainsHolding[] = holdings.map((h) => ({
    id: h.id,
    ticker: h.ticker,
    name: h.name,
    quantity: h.quantity,
    avg_cost: h.avg_cost,
    current_price: h.current_price,
    unrealized_gain_usd: (h.current_price - h.avg_cost) * h.quantity,
  }));

  const summary: CapitalGainsSummary = {
    year,
    exchange_rate: exchangeRate,
    realized_gain_usd: totalRealizedUsd,
    realized_gain_krw: totalRealizedKrw,
    deduction_krw: DEDUCTION_KRW,
    taxable_krw: taxableKrw,
    tax_krw: taxKrw,
    transactions: txResults,
    usd_holdings: usdHoldings,
  };

  return NextResponse.json(summary);
}
