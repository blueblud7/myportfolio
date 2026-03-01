import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import type { RebalancingSummary, RebalancingAccount, RebalancingAction } from "@/types";

export async function GET(req: NextRequest) {
  const tolerance = Number(new URL(req.url).searchParams.get("tolerance") ?? 5);
  const sql = getDb();
  const exchangeRate = await getCachedExchangeRate();

  // 모든 계좌 조회
  const accounts = await sql`SELECT * FROM accounts ORDER BY id` as {
    id: number; name: string; type: string; currency: string; target_pct: number;
  }[];

  // 각 계좌의 현재 가치 (KRW 환산)
  const valueMap: Record<number, number> = {};

  // 주식 계좌: holdings 기준
  const holdings = await sql`
    SELECT h.account_id, h.quantity, h.avg_cost, h.currency, h.ticker,
      CASE WHEN h.ticker='CASH' THEN h.avg_cost
           WHEN h.manual_price IS NOT NULL THEN h.manual_price
           ELSE COALESCE(p.price, h.avg_cost)
      END as current_price
    FROM holdings h
    LEFT JOIN price_history p ON h.ticker=p.ticker
      AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
  ` as { account_id: number; quantity: number; avg_cost: number; currency: string; ticker: string; current_price: number }[];

  for (const h of holdings) {
    const price = h.current_price || h.avg_cost;
    const value = h.quantity * price;
    const valueKrw = h.currency === "USD" ? value * exchangeRate : value;
    valueMap[h.account_id] = (valueMap[h.account_id] ?? 0) + valueKrw;
  }

  // 은행 계좌: 가장 최근 잔고
  const bankRows = await sql`
    SELECT bb.account_id, bb.balance, a.currency
    FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.date = (
      SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id
    )
  ` as { account_id: number; balance: number; currency: string }[];

  for (const b of bankRows) {
    const valueKrw = b.currency === "USD" ? b.balance * exchangeRate : b.balance;
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
  // body: [{ id, target_pct }, ...]
  const updates = await req.json() as { id: number; target_pct: number }[];
  const sql = getDb();
  for (const u of updates) {
    await sql`UPDATE accounts SET target_pct=${u.target_pct} WHERE id=${u.id}`;
  }
  return NextResponse.json({ success: true });
}
