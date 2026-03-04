import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface AccountDailyChange {
  account_id: number;
  date: string;
  current_value: number;   // KRW
  prev_value: number | null; // 전일 KRW
  daily_change: number;    // current - prev
  daily_change_pct: number; // %
}

export async function GET() {
  const sql = getDb();

  // 계좌별 최신 스냅샷 + 바로 전 스냅샷을 LAG()으로 가져옴
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sql`
    WITH ranked AS (
      SELECT
        account_id,
        value_krw,
        date,
        LAG(value_krw) OVER (PARTITION BY account_id ORDER BY date) AS prev_value,
        ROW_NUMBER()   OVER (PARTITION BY account_id ORDER BY date DESC) AS rn
      FROM account_snapshots
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
