import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAccountDailyValues } from "@/lib/snapshot";
import { todayKST } from "@/lib/tz";

export interface AccountDailyChange {
  account_id: number;
  date: string;
  current_value: number;   // KRW (실시간)
  prev_value: number | null; // 전일 종가 기준 KRW
  daily_change: number;    // current - prev
  daily_change_pct: number; // %
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayKST();
  // 현재값·전일 종가값 모두 실시간 시세로 계산 (종목별 등락률 기반, 스냅샷 불필요)
  const dailyValues = await getAccountDailyValues(user.id);

  const result: AccountDailyChange[] = [];
  for (const [account_id, { current, prev }] of dailyValues) {
    const hasPrev = prev > 0;
    const daily = hasPrev ? current - prev : 0;
    const pct = hasPrev ? (daily / prev) * 100 : 0;
    result.push({
      account_id,
      date: today,
      current_value: current,
      prev_value: hasPrev ? prev : null,
      daily_change: daily,
      daily_change_pct: pct,
    });
  }

  return NextResponse.json(result);
}
