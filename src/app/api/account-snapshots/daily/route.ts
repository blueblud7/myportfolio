import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sql`
    WITH ranked AS (
      SELECT
        s.account_id,
        s.value_krw,
        s.date,
        LAG(s.value_krw) OVER (PARTITION BY s.account_id ORDER BY s.date) AS prev_value,
        ROW_NUMBER()     OVER (PARTITION BY s.account_id ORDER BY s.date DESC) AS rn
      FROM account_snapshots s
      JOIN accounts a ON a.id = s.account_id
      WHERE a.user_id = ${user.id}
    )
    SELECT account_id, date, value_krw AS current_value, prev_value
    FROM ranked
    WHERE rn = 1
  `;

  const result: AccountDailyChange[] = rows.map((r) => {
    const cur = Number(r.current_value);
    const prev = r.prev_value !== null ? Number(r.prev_value) : null;
    const daily = prev !== null ? cur - prev : 0;
    const pct = prev !== null && prev > 0 ? (daily / prev) * 100 : 0;
    return {
      account_id: r.account_id,
      date: r.date,
      current_value: cur,
      prev_value: prev,
      daily_change: daily,
      daily_change_pct: pct,
    };
  });

  return NextResponse.json(result);
}
