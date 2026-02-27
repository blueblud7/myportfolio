import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getDividendCalendarEvents } from "@/lib/yahoo-finance";
import { isKoreanTicker } from "@/lib/ticker-resolver";
import { format, subDays } from "date-fns";
import type { DividendScheduleResponse, DividendScheduleItem } from "@/types";

function estimatePaymentMonths(frequency: string, exDividendDate: string | null): number[] {
  if (frequency === "monthly") {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
  if (frequency === "quarterly") {
    // If we know the ex-date, estimate quarters from it
    if (exDividendDate) {
      const baseMonth = new Date(exDividendDate).getMonth() + 1;
      // Payment usually 1 month after ex-date
      const payMonth = ((baseMonth) % 12) + 1;
      return [payMonth, ((payMonth + 2) % 12) + 1, ((payMonth + 5) % 12) + 1, ((payMonth + 8) % 12) + 1].sort((a, b) => a - b);
    }
    // Default US quarterly: Mar, Jun, Sep, Dec
    return [3, 6, 9, 12];
  }
  // annual
  if (exDividendDate) {
    const payMonth = ((new Date(exDividendDate).getMonth() + 1) % 12) + 1;
    return [payMonth];
  }
  // Default Korean annual: April (AGM payout)
  return [4];
}

export async function GET() {
  const db = getDb();
  const exchangeRate = getCachedExchangeRate();

  // Get holdings with dividend info
  const holdings = db
    .prepare(
      `SELECT h.ticker, h.name, h.quantity, h.currency,
              COALESCE(sm.annual_dividend, 0) as annual_dividend
       FROM holdings h
       JOIN accounts a ON h.account_id = a.id
       LEFT JOIN stock_metadata sm ON h.ticker = sm.ticker
       WHERE a.type = 'stock' AND h.ticker != 'CASH'
         AND COALESCE(sm.annual_dividend, 0) > 0`
    )
    .all() as {
    ticker: string;
    name: string;
    quantity: number;
    currency: string;
    annual_dividend: number;
  }[];

  // Aggregate by ticker (sum quantities across accounts)
  const tickerMap = new Map<string, { name: string; quantity: number; currency: string; annual_dividend: number }>();
  for (const h of holdings) {
    const existing = tickerMap.get(h.ticker);
    if (existing) {
      existing.quantity += h.quantity;
    } else {
      tickerMap.set(h.ticker, {
        name: h.name,
        quantity: h.quantity,
        currency: h.currency,
        annual_dividend: h.annual_dividend,
      });
    }
  }

  const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd HH:mm:ss");

  const items: DividendScheduleItem[] = [];

  for (const [ticker, info] of tickerMap) {
    // Check cached dividend schedule
    const cached = db
      .prepare(`SELECT * FROM dividend_schedule WHERE ticker = ?`)
      .get(ticker) as {
      ticker: string;
      ex_dividend_date: string | null;
      dividend_frequency: string;
      per_share_amount: number;
      updated_at: string | null;
    } | undefined;

    let frequency: string;
    let exDividendDate: string | null;
    let perShareAmount: number;

    if (cached && cached.updated_at && cached.updated_at > sevenDaysAgo) {
      // Use cached data
      frequency = cached.dividend_frequency;
      exDividendDate = cached.ex_dividend_date;
      perShareAmount = cached.per_share_amount || info.annual_dividend;
    } else {
      // Fetch from Yahoo
      const calEvents = await getDividendCalendarEvents(ticker);
      exDividendDate = calEvents?.exDividendDate ?? null;

      // Estimate frequency
      const isKR = isKoreanTicker(ticker);
      frequency = isKR ? "annual" : "quarterly";
      perShareAmount = info.annual_dividend;

      // Save to DB
      db.prepare(
        `INSERT OR REPLACE INTO dividend_schedule (ticker, ex_dividend_date, dividend_frequency, per_share_amount, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(ticker, exDividendDate, frequency, perShareAmount);
    }

    const annualIncomeRaw = info.quantity * perShareAmount;
    const annualIncomeKrw = info.currency === "USD" ? annualIncomeRaw * exchangeRate : annualIncomeRaw;

    const paymentMonths = estimatePaymentMonths(frequency, exDividendDate);

    items.push({
      ticker,
      name: info.name,
      frequency,
      per_share_amount: perShareAmount,
      quantity: info.quantity,
      annual_income_krw: annualIncomeKrw,
      ex_dividend_date: exDividendDate,
      payment_months: paymentMonths,
    });
  }

  // Calculate monthly totals
  const monthly: { month: number; amount_krw: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    let amount = 0;
    for (const item of items) {
      if (item.payment_months.includes(m)) {
        // Divide annual income by number of payments
        amount += item.annual_income_krw / item.payment_months.length;
      }
    }
    monthly.push({ month: m, amount_krw: Math.round(amount) });
  }

  const totalAnnualKrw = items.reduce((sum, item) => sum + item.annual_income_krw, 0);

  const response: DividendScheduleResponse = {
    monthly,
    total_annual_krw: Math.round(totalAnnualKrw),
    items: items.sort((a, b) => b.annual_income_krw - a.annual_income_krw),
  };

  return NextResponse.json(response);
}
