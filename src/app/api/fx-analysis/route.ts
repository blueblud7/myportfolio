import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();

  // Get all USD holdings with latest price
  const holdings = await sql`
    SELECT
      h.id, h.ticker, h.name, h.quantity, h.avg_cost, h.date as holding_date,
      ph.price as current_price
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id AND a.currency = 'USD'
    LEFT JOIN price_history ph ON ph.ticker = h.ticker
      AND ph.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE h.ticker != 'CASH' AND a.user_id = ${user.id}
  `;

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
