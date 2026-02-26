import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import type { ReportData } from "@/types";

export async function GET() {
  const db = getDb();
  const exchangeRate = getCachedExchangeRate();

  const holdings = db
    .prepare(
      `SELECT h.*, a.name as account_name, a.currency as account_currency, a.type as account_type,
              CASE WHEN h.ticker = 'CASH' THEN h.avg_cost
                   WHEN h.manual_price IS NOT NULL AND h.manual_price > 0 THEN h.manual_price
                   ELSE COALESCE(p.price, h.avg_cost)
              END as current_price,
              COALESCE(sm.sector, '') as sector,
              COALESCE(sm.annual_dividend, 0) as annual_dividend,
              COALESCE(sm.dividend_yield, 0) as dividend_yield
       FROM holdings h
       JOIN accounts a ON h.account_id = a.id
       LEFT JOIN price_history p ON h.ticker = p.ticker
         AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
       LEFT JOIN stock_metadata sm ON h.ticker = sm.ticker
       WHERE a.type = 'stock'`
    )
    .all() as {
    ticker: string;
    name: string;
    quantity: number;
    avg_cost: number;
    currency: string;
    account_name: string;
    account_currency: string;
    current_price: number;
    sector: string;
    annual_dividend: number;
    dividend_yield: number;
  }[];

  const bankBalances = db
    .prepare(
      `SELECT bb.balance, a.name as account_name, a.currency
       FROM bank_balances bb
       JOIN accounts a ON bb.account_id = a.id
       WHERE a.type = 'bank'
         AND bb.date = (SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id)
       GROUP BY bb.account_id`
    )
    .all() as { balance: number; account_name: string; currency: string }[];

  const byCurrency: Record<string, number> = {};
  const byAccount: Record<string, number> = {};
  const bySector: Record<string, number> = {};
  const performers: { ticker: string; name: string; gain_loss_pct: number }[] = [];
  const dividendItems: {
    ticker: string;
    name: string;
    quantity: number;
    annual_dividend: number;
    annual_income_krw: number;
    dividend_yield: number;
  }[] = [];

  for (const h of holdings) {
    const marketValue = h.quantity * h.current_price;
    const costBasis = h.quantity * h.avg_cost;
    const valueKrw = h.currency === "USD" ? marketValue * exchangeRate : marketValue;

    byCurrency[h.currency] = (byCurrency[h.currency] ?? 0) + valueKrw;
    byAccount[h.account_name] = (byAccount[h.account_name] ?? 0) + valueKrw;

    const sectorKey = h.sector || "기타";
    bySector[sectorKey] = (bySector[sectorKey] ?? 0) + valueKrw;

    if (costBasis > 0 && h.ticker !== "CASH") {
      performers.push({
        ticker: h.ticker,
        name: h.name,
        gain_loss_pct: ((marketValue - costBasis) / costBasis) * 100,
      });
    }

    if (h.annual_dividend > 0 && h.ticker !== "CASH") {
      const annual_income_krw =
        h.currency === "USD"
          ? h.quantity * h.annual_dividend * exchangeRate
          : h.quantity * h.annual_dividend;
      dividendItems.push({
        ticker: h.ticker,
        name: h.name,
        quantity: h.quantity,
        annual_dividend: h.annual_dividend,
        annual_income_krw,
        dividend_yield: h.dividend_yield,
      });
    }
  }

  for (const b of bankBalances) {
    const valueKrw = b.currency === "USD" ? b.balance * exchangeRate : b.balance;
    byCurrency[b.currency] = (byCurrency[b.currency] ?? 0) + valueKrw;
    byAccount[b.account_name] = (byAccount[b.account_name] ?? 0) + valueKrw;
  }

  const totalValue = Object.values(byCurrency).reduce((a, b) => a + b, 0);

  dividendItems.sort((a, b) => b.annual_income_krw - a.annual_income_krw);
  const totalDividendKrw = dividendItems.reduce((sum, item) => sum + item.annual_income_krw, 0);

  const report: ReportData = {
    by_currency: Object.entries(byCurrency).map(([currency, value_krw]) => ({
      currency,
      value_krw,
      pct: totalValue > 0 ? (value_krw / totalValue) * 100 : 0,
    })),
    by_account: Object.entries(byAccount)
      .map(([name, value_krw]) => ({
        name,
        value_krw,
        pct: totalValue > 0 ? (value_krw / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value_krw - a.value_krw),
    by_sector: Object.entries(bySector)
      .map(([sector, value_krw]) => ({
        sector,
        value_krw,
        pct: totalValue > 0 ? (value_krw / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value_krw - a.value_krw),
    top_performers: [...performers].sort((a, b) => b.gain_loss_pct - a.gain_loss_pct).slice(0, 5),
    worst_performers: [...performers].sort((a, b) => a.gain_loss_pct - b.gain_loss_pct).slice(0, 5),
    dividend_income: {
      total_krw: totalDividendKrw,
      items: dividendItems,
    },
  };

  return NextResponse.json(report);
}
