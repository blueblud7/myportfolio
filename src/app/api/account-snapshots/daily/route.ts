import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";

export interface AccountDailyChange {
  account_id: number;
  date: string;
  current_value: number;   // KRW
  prev_value: number | null; // 전일 KRW
  daily_change: number;    // current - prev
  daily_change_pct: number; // %
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await sql`ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS value_krw_enc TEXT`.catch(() => {});

  // 암호화된 value_krw는 SQL LAG 못 씀 → 전체 행 가져와 JS에서 정렬·계산
  const rows = await sql`
    SELECT s.account_id, s.value_krw, s.value_krw_enc, s.date
    FROM account_snapshots s
    JOIN accounts a ON a.id = s.account_id
    WHERE a.user_id = ${user.id}
    ORDER BY s.account_id, s.date
  ` as { account_id: number; value_krw: number | null; value_krw_enc: string | null; date: string }[];

  // 계좌별로 최신/직전 값 추출
  const byAccount = new Map<number, { date: string; value: number }[]>();
  for (const r of rows) {
    const v = r.value_krw_enc ? (decryptNum(r.value_krw_enc) ?? 0) : (r.value_krw ?? 0);
    const arr = byAccount.get(r.account_id) ?? [];
    arr.push({ date: r.date, value: v });
    byAccount.set(r.account_id, arr);
  }

  const result: AccountDailyChange[] = [];
  for (const [account_id, arr] of byAccount) {
    if (arr.length === 0) continue;
    arr.sort((a, b) => a.date.localeCompare(b.date)); // ascending
    const latest = arr[arr.length - 1];
    const prev = arr.length >= 2 ? arr[arr.length - 2] : null;
    const cur = latest.value;
    const prevVal = prev ? prev.value : null;
    const daily = prevVal !== null ? cur - prevVal : 0;
    const pct = prevVal !== null && prevVal > 0 ? (daily / prevVal) * 100 : 0;
    result.push({
      account_id,
      date: latest.date,
      current_value: cur,
      prev_value: prevVal,
      daily_change: daily,
      daily_change_pct: pct,
    });
  }

  return NextResponse.json(result);
}
