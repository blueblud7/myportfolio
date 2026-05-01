import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";
import { decryptAccountName } from "@/lib/account-crypto";
import { decryptHoldingFields } from "@/lib/holdings-crypto";
import type { RebalancingSummary, RebalancingAccount, RebalancingAction } from "@/types";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tolerance = Number(new URL(req.url).searchParams.get("tolerance") ?? 5);
  const sql = getDb();
  const exchangeRate = await getCachedExchangeRate();

  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name_enc TEXT`.catch(() => {});
  // 모든 계좌 조회
  const accountsRaw = await sql`SELECT * FROM accounts WHERE user_id = ${user.id} ORDER BY id` as {
    id: number; name: string | null; name_enc: string | null; type: string; currency: string; target_pct: number;
  }[];
  const accounts = accountsRaw.map(a => ({ ...a, name: decryptAccountName(a) }));

  // 각 계좌의 현재 가치 (KRW 환산)
  const valueMap: Record<number, number> = {};

  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});
  // 주식 계좌: holdings 기준
  const holdingsRaw = await sql`
    SELECT h.account_id, h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           h.manual_price, h.manual_price_enc, h.currency, h.ticker,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker=p.ticker
      AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
    WHERE a.user_id = ${user.id}
  ` as { account_id: number; quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         manual_price: number | null; manual_price_enc: string | null;
         currency: string; ticker: string; price_market: number }[];

  for (const h of holdingsRaw) {
    const d = decryptHoldingFields(h);
    const qty = d.quantity ?? 0;
    const cost = d.avg_cost ?? 0;
    const manual = d.manual_price;
    const price =
      h.ticker === "CASH" ? cost :
      manual !== null && manual !== undefined && manual > 0 ? manual :
      (h.price_market || cost);
    const value = qty * price;
    const valueKrw = h.currency === "USD" ? value * exchangeRate : value;
    valueMap[h.account_id] = (valueMap[h.account_id] ?? 0) + valueKrw;
  }

  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS balance_enc TEXT`.catch(() => {});
  // 은행 계좌: 가장 최근 잔고
  const bankRows = await sql`
    SELECT bb.account_id, bb.balance, bb.balance_enc, a.currency
    FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.date = (
      SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id
    )
      AND a.user_id = ${user.id}
  ` as { account_id: number; balance: number | null; balance_enc: string | null; currency: string }[];

  for (const b of bankRows) {
    const balance = b.balance_enc !== null ? (decryptNum(b.balance_enc) ?? 0) : (b.balance ?? 0);
    const valueKrw = b.currency === "USD" ? balance * exchangeRate : balance;
    valueMap[b.account_id] = (valueMap[b.account_id] ?? 0) + valueKrw;
  }

  const totalKrw = Object.values(valueMap).reduce((s, v) => s + v, 0);
  const totalTargetPct = accounts.reduce((s, a) => s + a.target_pct, 0);

  const rebalAccounts: RebalancingAccount[] = accounts.map((a) => {
    const currentKrw = valueMap[a.id] ?? 0;
    const currentPct = totalKrw > 0 ? (currentKrw / totalKrw) * 100 : 0;
    const diffPct = currentPct - a.target_pct;
    // 목표 금액 - 현재 금액
    const targetKrw = totalKrw * (a.target_pct / 100);
    const diffKrw = currentKrw - targetKrw; // 양수: 초과(매도 필요), 음수: 부족(매수 필요)

    let action: RebalancingAction = "hold";
    if (Math.abs(diffPct) > tolerance) {
      action = diffKrw > 0 ? "sell" : "buy";
    }

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      target_pct: a.target_pct,
      current_krw: currentKrw,
      current_pct: currentPct,
      diff_pct: diffPct,
      diff_krw: diffKrw,
      action,
      action_krw: Math.abs(diffKrw),
    };
  });

  const needsRebalancing = rebalAccounts.some((a) => a.action !== "hold");

  const summary: RebalancingSummary = {
    total_krw: totalKrw,
    exchange_rate: exchangeRate,
    total_target_pct: totalTargetPct,
    accounts: rebalAccounts,
    needs_rebalancing: needsRebalancing,
    tolerance,
  };

  return NextResponse.json(summary);
}

/** 계좌별 목표 비중 일괄 업데이트 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // body: [{ id, target_pct }, ...]
  const updates = await req.json() as { id: number; target_pct: number }[];
  const sql = getDb();
  for (const u of updates) {
    await sql`UPDATE accounts SET target_pct=${u.target_pct} WHERE id=${u.id} AND user_id=${user.id}`;
  }
  return NextResponse.json({ success: true });
}
