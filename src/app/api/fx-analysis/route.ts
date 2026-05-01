import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();

  // Get all USD holdings with latest price
  const rawHoldings = await sql`
    SELECT
      h.id, h.ticker, h.name,
      h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc, h.date as holding_date,
      ph.price as current_price
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id AND a.currency = 'USD'
    LEFT JOIN price_history ph ON ph.ticker = h.ticker
      AND ph.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE h.ticker != 'CASH' AND a.user_id = ${user.id}
  ` as { id: number; ticker: string; name: string;
         quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         holding_date: string; current_price: number | null }[];
  const holdings = rawHoldings.map(h => ({
    ...h,
    quantity: h.quantity_enc ? (decryptNum(h.quantity_enc) ?? 0) : (h.quantity ?? 0),
    avg_cost: h.avg_cost_enc ? (decryptNum(h.avg_cost_enc) ?? 0) : (h.avg_cost ?? 0),
  }));

  if (holdings.length === 0) {
    return NextResponse.json({ items: [], current_fx: 1350 });
  }

  // Get current exchange rate
  const [currentRateRow] = await sql`SELECT rate FROM exchange_rates ORDER BY date DESC LIMIT 1`;
  const currentFx = Number(currentRateRow?.rate ?? 1350);

  const results = await Promise.all(
    holdings.map(async (h) => {
      // Find earliest buy transaction to get purchase date + fx rate
      const [firstBuy] = await sql`
        SELECT t.date, er.rate as fx_rate
        FROM transactions t
        LEFT JOIN exchange_rates er ON er.date = (
          SELECT MAX(e.date) FROM exchange_rates e WHERE e.date <= t.date
        )
        WHERE t.account_id IN (SELECT id FROM accounts WHERE currency = 'USD')
          AND t.ticker = ${h.ticker}
          AND t.type = 'buy'
        ORDER BY t.date ASC
        LIMIT 1
      `;

      let purchaseFx = Number(firstBuy?.fx_rate ?? 0);
      const purchaseDate = firstBuy?.date ?? h.holding_date;

      if (!purchaseFx) {
        const [fxRow] = await sql`
          SELECT rate FROM exchange_rates
          WHERE date <= ${purchaseDate}
          ORDER BY date DESC LIMIT 1
        `;
        purchaseFx = Number(fxRow?.rate ?? currentFx);
      }

      const currentPrice = Number(h.current_price ?? h.avg_cost);
      const avgCost = Number(h.avg_cost);
      const qty = Number(h.quantity);

      // Stock return in USD %
      const stockReturnUsd = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;

      // FX return % (how much KRW you get per USD changed)
      const fxReturn = purchaseFx > 0 ? ((currentFx - purchaseFx) / purchaseFx) * 100 : 0;

      // Total KRW return = (currentPrice * currentFx) / (avgCost * purchaseFx) - 1
      const totalReturnKrw =
        avgCost > 0 && purchaseFx > 0
          ? ((currentPrice * currentFx) / (avgCost * purchaseFx) - 1) * 100
          : 0;

      return {
        ticker: h.ticker,
        name: h.name,
        quantity: qty,
        avg_cost: avgCost,
        current_price: currentPrice,
        purchase_fx: purchaseFx,
        current_fx: currentFx,
        stock_return_usd: stockReturnUsd,
        fx_return: fxReturn,
        total_return_krw: totalReturnKrw,
        market_value_usd: currentPrice * qty,
        market_value_krw: currentPrice * qty * currentFx,
        purchase_date: purchaseDate,
      };
    })
  );

  return NextResponse.json({ items: results, current_fx: currentFx });
}
