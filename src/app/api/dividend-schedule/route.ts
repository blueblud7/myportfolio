import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getDividendCalendarEvents } from "@/lib/yahoo-finance";
import { isKoreanTicker } from "@/lib/ticker-resolver";
import { format, subDays } from "date-fns";
import type { DividendScheduleResponse, DividendScheduleItem } from "@/types";

function estimatePaymentMonths(frequency: string, exDividendDate: string | null): number[] {
  if (frequency === "monthly") return [1,2,3,4,5,6,7,8,9,10,11,12];
  if (frequency === "quarterly") {
    if (exDividendDate) {
      const baseMonth = new Date(exDividendDate).getMonth() + 1;
      const payMonth = (baseMonth % 12) + 1;
      return [payMonth, ((payMonth+2)%12)+1, ((payMonth+5)%12)+1, ((payMonth+8)%12)+1].sort((a,b)=>a-b);
    }
    return [3,6,9,12];
  }
  if (exDividendDate) return [((new Date(exDividendDate).getMonth()+1)%12)+1];
  return [4];
}

export async function GET() {
  const sql = getDb();
  const exchangeRate = await getCachedExchangeRate();

  const holdings = await sql`
    SELECT h.ticker, h.name, h.quantity, h.currency, COALESCE(sm.annual_dividend,0) as annual_dividend
    FROM holdings h
    JOIN accounts a ON h.account_id=a.id
    LEFT JOIN stock_metadata sm ON h.ticker=sm.ticker
    WHERE a.type='stock' AND h.ticker!='CASH' AND COALESCE(sm.annual_dividend,0)>0
  ` as { ticker:string; name:string; quantity:number; currency:string; annual_dividend:number }[];

  const tickerMap = new Map<string,{ name:string; quantity:number; currency:string; annual_dividend:number }>();
  for (const h of holdings) {
    const ex = tickerMap.get(h.ticker);
    if (ex) ex.quantity += h.quantity;
    else tickerMap.set(h.ticker, { name:h.name, quantity:h.quantity, currency:h.currency, annual_dividend:h.annual_dividend });
  }

  const sevenDaysAgo = format(subDays(new Date(),7), "yyyy-MM-dd HH:mm:ss");
  const items: DividendScheduleItem[] = [];

  for (const [ticker, info] of tickerMap) {
    const rows = await sql`SELECT * FROM dividend_schedule WHERE ticker=${ticker}`;
    const cached = rows[0] as { ex_dividend_date:string|null; dividend_frequency:string; per_share_amount:number; updated_at:string|null } | undefined;
    let frequency: string, exDividendDate: string|null, perShareAmount: number;

    if (cached?.updated_at && cached.updated_at > sevenDaysAgo) {
      frequency = cached.dividend_frequency;
      exDividendDate = cached.ex_dividend_date;
      perShareAmount = cached.per_share_amount || info.annual_dividend;
    } else {
      const calEvents = await getDividendCalendarEvents(ticker);
      exDividendDate = calEvents?.exDividendDate ?? null;
      frequency = isKoreanTicker(ticker) ? "annual" : "quarterly";
      perShareAmount = info.annual_dividend;
      await sql`
        INSERT INTO dividend_schedule (ticker, ex_dividend_date, dividend_frequency, per_share_amount, updated_at)
        VALUES (${ticker}, ${exDividendDate}, ${frequency}, ${perShareAmount}, to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
        ON CONFLICT (ticker) DO UPDATE SET ex_dividend_date=${exDividendDate}, dividend_frequency=${frequency},
          per_share_amount=${perShareAmount}, updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
      `;
    }

    const annualIncomeRaw = info.quantity * perShareAmount;
    const annualIncomeKrw = info.currency==="USD" ? annualIncomeRaw*exchangeRate : annualIncomeRaw;
    items.push({ ticker, name:info.name, frequency, per_share_amount:perShareAmount,
      quantity:info.quantity, annual_income_krw:annualIncomeKrw, ex_dividend_date:exDividendDate,
      payment_months:estimatePaymentMonths(frequency, exDividendDate) });
  }

  const monthly = Array.from({length:12}, (_,i) => ({
    month: i+1,
    amount_krw: Math.round(items.filter(it=>it.payment_months.includes(i+1)).reduce((s,it)=>s+it.annual_income_krw/it.payment_months.length,0))
  }));

  const response: DividendScheduleResponse = {
    monthly, total_annual_krw: Math.round(items.reduce((s,i)=>s+i.annual_income_krw,0)),
    items: items.sort((a,b)=>b.annual_income_krw-a.annual_income_krw)
  };
  return NextResponse.json(response);
}
