import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateDigest, buildPushSummary, type DigestPeriod } from "@/lib/digest";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 300;

const VALID: DigestPeriod[] = ["daily", "weekly", "monthly"];
const TITLE: Record<DigestPeriod, string> = {
  daily: "📈 오늘의 보유종목 브리핑",
  weekly: "📊 이번 주 보유종목 브리핑",
  monthly: "🗓️ 이번 달 보유종목 브리핑",
};

export async function GET(req: NextRequest) {
  // Vercel Cron 인증
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const periodParam = (req.nextUrl.searchParams.get("period") ?? "daily") as DigestPeriod;
  const period: DigestPeriod = VALID.includes(periodParam) ? periodParam : "daily";

  const sql = getDb();
  // 주식 보유가 있는 사용자만 대상
  const users = (await sql`
    SELECT DISTINCT a.user_id AS id
    FROM accounts a
    JOIN holdings h ON h.account_id = a.id
    WHERE a.type = 'stock' AND h.ticker != 'CASH' AND a.user_id IS NOT NULL
  `) as { id: number }[];

  const results: { user_id: number; ok: boolean; pushed?: number; error?: string }[] = [];
  for (const u of users) {
    try {
      const rec = await generateDigest(u.id, period);
      if (!rec) { results.push({ user_id: u.id, ok: true, pushed: 0 }); continue; }
      const { sent } = await sendPushToUser(u.id, {
        title: TITLE[period],
        body: buildPushSummary(rec),
        url: "/briefing",
      });
      results.push({ user_id: u.id, ok: true, pushed: sent });
    } catch (e) {
      results.push({ user_id: u.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    period,
    users: users.length,
    generated: results.filter((r) => r.ok).length,
    pushed: results.reduce((s, r) => s + (r.pushed ?? 0), 0),
    results,
  });
}
