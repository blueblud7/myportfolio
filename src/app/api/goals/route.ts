import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS annual_goals (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL UNIQUE,
      return_target_pct NUMERIC NOT NULL,
      value_target_usd NUMERIC,
      start_value_usd NUMERIC,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS value_target_usd NUMERIC`.catch(() => {});
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS start_value_usd NUMERIC`.catch(() => {});
}

type GoalRow = {
  id: number;
  year: number;
  return_target_pct: number;
  value_target_usd: number | null;
  start_value_usd: number | null;
  note: string | null;
};

export async function GET() {
  await ensureTable();
  const sql = getDb();
  const year = new Date().getFullYear();

  const [goals, startSnaps, latestSnaps, exchangeRate] = await Promise.all([
    sql`SELECT * FROM annual_goals ORDER BY year DESC`.then((r) => r as unknown as GoalRow[]),
    sql`
      SELECT total_krw, date FROM snapshots
      WHERE date >= ${`${year}-01-01`}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number; date: string }[]),
    sql`
      SELECT total_krw, date FROM snapshots
      ORDER BY date DESC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number; date: string }[]),
    getCachedExchangeRate(),
  ]);

  const currentGoal = goals.find((g) => g.year === year) ?? null;

  // 연초값: goal에 수동 입력값 있으면 우선, 없으면 스냅샷
  const snapshotStartKrw = startSnaps[0]?.total_krw ? Number(startSnaps[0].total_krw) : null;
  const snapshotStartUsd = snapshotStartKrw ? snapshotStartKrw / exchangeRate : null;
  const startUsd: number | null =
    currentGoal?.start_value_usd ? Number(currentGoal.start_value_usd) : snapshotStartUsd;
  const startKrw = startUsd ? startUsd * exchangeRate : snapshotStartKrw;

  const currentKrw = latestSnaps[0]?.total_krw ? Number(latestSnaps[0].total_krw) : null;
  const currentUsd = currentKrw ? currentKrw / exchangeRate : null;

  const ytdPct =
    startUsd && currentUsd && startUsd > 0
      ? ((currentUsd - startUsd) / startUsd) * 100
      : null;

  const now = new Date();
  const yearEnd = new Date(year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / 86400000));
  const daysPassed = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
  const totalDays = daysPassed + daysLeft;

  return NextResponse.json({
    goals,
    currentGoal,
    ytd: { startKrw, currentKrw, startUsd, currentUsd, returnPct: ytdPct },
    exchangeRate,
    daysLeft,
    daysPassed,
    totalDays,
    year,
  });
}

export async function POST(req: NextRequest) {
  await ensureTable();
  const sql = getDb();
  const body = (await req.json()) as {
    year: number;
    returnTargetPct?: number;
    valueTargetUsd?: number;
    startValueUsd?: number;
    note?: string;
  };

  const { year, note } = body;
  const startValueUsd = body.startValueUsd ?? null;

  // startUsd 결정: 입력값 > 스냅샷
  let resolvedStartUsd: number | null = startValueUsd;
  if (!resolvedStartUsd) {
    const exchangeRate = await getCachedExchangeRate();
    const snaps = await sql`
      SELECT total_krw FROM snapshots
      WHERE date >= ${`${year}-01-01`}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number }[]);
    const startKrw = snaps[0]?.total_krw ? Number(snaps[0].total_krw) : null;
    resolvedStartUsd = startKrw ? startKrw / exchangeRate : null;
  }

  let returnTargetPct = body.returnTargetPct ?? null;
  let valueTargetUsd = body.valueTargetUsd ?? null;

  if (valueTargetUsd !== null && returnTargetPct === null && resolvedStartUsd) {
    returnTargetPct = ((valueTargetUsd - resolvedStartUsd) / resolvedStartUsd) * 100;
  } else if (returnTargetPct !== null && valueTargetUsd === null && resolvedStartUsd) {
    valueTargetUsd = resolvedStartUsd * (1 + returnTargetPct / 100);
  }

  if (returnTargetPct === null) return NextResponse.json({ error: "목표값 필요" }, { status: 400 });

  const rows = await sql`
    INSERT INTO annual_goals (year, return_target_pct, value_target_usd, start_value_usd, note)
    VALUES (${year}, ${returnTargetPct}, ${valueTargetUsd}, ${startValueUsd}, ${note ?? null})
    ON CONFLICT (year) DO UPDATE SET
      return_target_pct = EXCLUDED.return_target_pct,
      value_target_usd  = EXCLUDED.value_target_usd,
      start_value_usd   = EXCLUDED.start_value_usd,
      note              = EXCLUDED.note
    RETURNING *
  ` as unknown as GoalRow[];

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  await ensureTable();
  const sql = getDb();
  const year = Number(req.nextUrl.searchParams.get("year"));
  await sql`DELETE FROM annual_goals WHERE year = ${year}`;
  return NextResponse.json({ ok: true });
}
