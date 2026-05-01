import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";
import { decryptJoinedAccountName } from "@/lib/account-crypto";
import { decryptHoldingFields } from "@/lib/holdings-crypto";
import type { ReportData } from "@/types";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const exchangeRate = await getCachedExchangeRate();

  // 암호화 컬럼 보장 (각 페이지 안 들렀어도 안전)
  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS balance_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});

  const holdingsRaw = await sql`
    SELECT h.*, a.name as account_name, a.name_enc as account_name_enc, a.currency as account_currency, a.type as account_type,
      COALESCE(p.price, 0) as price_market,
      COALESCE(sm.sector,'') as sector,
      COALESCE(sm.annual_dividend,0) as annual_dividend,
      COALESCE(sm.dividend_yield,0) as dividend_yield
    FROM holdings h
    JOIN accounts a ON h.account_id=a.id
    LEFT JOIN price_history p ON h.ticker=p.ticker
      AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
    LEFT JOIN stock_metadata sm ON h.ticker=sm.ticker
    WHERE a.type='stock' AND a.user_id=${user.id}
  ` as { ticker:string; name:string;
         quantity:number | null; quantity_enc:string | null;
         avg_cost:number | null; avg_cost_enc:string | null;
         manual_price:number | null; manual_price_enc:string | null;
         currency:string;
         account_name:string | null; account_name_enc:string | null;
         price_market:number; sector:string; annual_dividend:number; dividend_yield:number }[];
  const holdings = holdingsRaw.map(h => {
    const d = decryptHoldingFields(h);
    const manual = d.manual_price;
    const current_price =
      manual !== null && manual !== undefined && manual > 0 ? manual :
      h.ticker === "CASH" ? (d.avg_cost ?? 0) :
      (h.price_market || (d.avg_cost ?? 0));
    return {
      ...h,
      quantity: d.quantity ?? 0,
      avg_cost: d.avg_cost ?? 0,
      account_name: decryptJoinedAccountName(h),
      current_price,
    };
  });

  const bankRows = await sql`
    SELECT bb.balance, bb.balance_enc, a.name as account_name, a.name_enc as account_name_enc, a.currency
    FROM bank_balances bb JOIN accounts a ON bb.account_id=a.id
    WHERE a.type='bank' AND a.user_id=${user.id}
      AND bb.date=(SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id=bb.account_id)
    GROUP BY bb.account_id, bb.balance, bb.balance_enc, a.name, a.name_enc, a.currency
  ` as { balance: number | null; balance_enc: string | null; account_name: string | null; account_name_enc: string | null; currency: string }[];
  const bankBalances = bankRows.map(r => ({
    balance: r.balance_enc !== null ? (decryptNum(r.balance_enc) ?? 0) : (r.balance ?? 0),
    account_name: decryptJoinedAccountName(r),
    currency: r.currency,
  }));

  const byCurrency: Record<string,number> = {};
  const byAccount: Record<string,number> = {};
  const bySector: Record<string,number> = {};
  const performers: { ticker:string; name:string; quantity:number; avg_cost:number; current_price:number;
    market_value:number; gain_loss:number; gain_loss_pct:number; currency:string; account_name:string }[] = [];
  const dividendItems: { ticker:string; name:string; quantity:number; annual_dividend:number; annual_income_krw:number; dividend_yield:number }[] = [];

  for (const h of holdings) {
    const mv = h.quantity * h.current_price;
    const cb = h.quantity * h.avg_cost;
    const vKrw = h.currency==="USD" ? mv*exchangeRate : mv;
    byCurrency[h.currency] = (byCurrency[h.currency]??0) + vKrw;
    byAccount[h.account_name] = (byAccount[h.account_name]??0) + vKrw;
    bySector[h.sector||"Other"] = (bySector[h.sector||"Other"]??0) + vKrw;
    if (cb>0 && h.ticker!=="CASH") performers.push({ ticker:h.ticker, name:h.name, quantity:h.quantity,
      avg_cost:h.avg_cost, current_price:h.current_price, market_value:mv, gain_loss:mv-cb,
      gain_loss_pct:((mv-cb)/cb)*100, currency:h.currency, account_name:h.account_name });
    if (h.annual_dividend>0 && h.ticker!=="CASH") {
      const inc = h.currency==="USD" ? h.quantity*h.annual_dividend*exchangeRate : h.quantity*h.annual_dividend;
      dividendItems.push({ ticker:h.ticker, name:h.name, quantity:h.quantity,
        annual_dividend:h.annual_dividend, annual_income_krw:inc, dividend_yield:h.dividend_yield });
    }
  }
  for (const b of bankBalances) {
    const vKrw = b.currency==="USD" ? b.balance*exchangeRate : b.balance;
    byCurrency[b.currency] = (byCurrency[b.currency]??0) + vKrw;
    byAccount[b.account_name] = (byAccount[b.account_name]??0) + vKrw;
  }
  const total = Object.values(byCurrency).reduce((a,b)=>a+b,0);
  dividendItems.sort((a,b)=>b.annual_income_krw-a.annual_income_krw);

  const report: ReportData = {
    by_currency: Object.entries(byCurrency).map(([currency,value_krw])=>({ currency, value_krw, pct: total>0?(value_krw/total)*100:0 })),
    by_account: Object.entries(byAccount).map(([name,value_krw])=>({ name, value_krw, pct:total>0?(value_krw/total)*100:0 })).sort((a,b)=>b.value_krw-a.value_krw),
    by_sector: Object.entries(bySector).map(([sector,value_krw])=>({ sector, value_krw, pct:total>0?(value_krw/total)*100:0 })).sort((a,b)=>b.value_krw-a.value_krw),
    top_performers: [...performers].sort((a,b)=>b.gain_loss_pct-a.gain_loss_pct).slice(0,5),
    worst_performers: [...performers].sort((a,b)=>a.gain_loss_pct-b.gain_loss_pct).slice(0,5),
    all_performers: [...performers].sort((a,b)=>b.gain_loss_pct-a.gain_loss_pct),
    dividend_income: { total_krw: dividendItems.reduce((s,i)=>s+i.annual_income_krw,0), items: dividendItems },
  };
  return NextResponse.json(report);
}
