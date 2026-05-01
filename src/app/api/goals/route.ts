import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCachedExchangeRate } from "@/lib/exchange-rate";
import { getSessionUser } from "@/lib/auth";
import { decryptNum } from "@/lib/crypto";

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS annual_goals (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      return_target_pct NUMERIC NOT NULL,
      value_target_usd NUMERIC,
      start_value_usd NUMERIC,
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS value_target_usd NUMERIC`.catch(() => {});
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS start_value_usd NUMERIC`.catch(() => {});
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`.catch(() => {});
  // 기존 UNIQUE(year) → UNIQUE(user_id, year) 마이그레이션
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'annual_goals_year_key' AND conrelid = 'annual_goals'::regclass) THEN
        ALTER TABLE annual_goals DROP CONSTRAINT annual_goals_year_key;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'annual_goals_user_id_year_key' AND conrelid = 'annual_goals'::regclass) THEN
        ALTER TABLE annual_goals ADD CONSTRAINT annual_goals_user_id_year_key UNIQUE (user_id, year);
      END IF;
    END $$;
  `.catch(() => {});
  // 기존 데이터 귀속 (유저 1명이면)
  await sql`
    UPDATE annual_goals SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `.catch(() => {});
}

type GoalRow = {
  id: number;
  year: number;
  return_target_pct: number;
  value_target_usd: number | null;
  start_value_usd: number | null;
  note: string | null;
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const year = new Date().getFullYear();

  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS total_krw_enc TEXT`.catch(() => {});
  const [goals, startSnaps, latestSnaps, exchangeRate] = await Promise.all([
    sql`SELECT * FROM annual_goals WHERE user_id = ${user.id} ORDER BY year DESC`.then((r) => r as unknown as GoalRow[]),
    sql`
      SELECT total_krw, total_krw_enc, date FROM snapshots
      WHERE date >= ${`${year}-01-01`} AND user_id = ${user.id}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number | null; total_krw_enc: string | null; date: string }[]),
    sql`
      SELECT total_krw, total_krw_enc, date FROM snapshots
      WHERE user_id = ${user.id}
      ORDER BY date DESC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number | null; total_krw_enc: string | null; date: string }[]),
    getCachedExchangeRate(),
  ]);

  const currentGoal = goals.find((g) => g.year === year) ?? null;

  const startEnc = startSnaps[0]?.total_krw_enc;
  const snapshotStartKrw = startEnc ? (decryptNum(startEnc) ?? null) : (startSnaps[0]?.total_krw ?? null);
  const snapshotStartUsd = snapshotStartKrw ? snapshotStartKrw / exchangeRate : null;
  const startUsd: number | null =
    currentGoal?.start_value_usd ? Number(currentGoal.start_value_usd) : snapshotStartUsd;
  const startKrw = startUsd ? startUsd * exchangeRate : snapshotStartKrw;

  const latestEnc = latestSnaps[0]?.total_krw_enc;
  const currentKrw = latestEnc ? (decryptNum(latestEnc) ?? null) : (latestSnaps[0]?.total_krw ?? null);
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
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const body = (await req.json()) as {
    year: number;
    returnTargetPct?: number;
    valueTargetUsd?: number;
    startValueUsd?: number;
    note?: string;
  };

  const { year, note } = body;
  const startValueUsd = body.startValueUsd ?? null;

  let resolvedStartUsd: number | null = startValueUsd;
  if (!resolvedStartUsd) {
    const exchangeRate = await getCachedExchangeRate();
    const snaps = await sql`
      SELECT total_krw, total_krw_enc FROM snapshots
      WHERE date >= ${`${year}-01-01`} AND user_id = ${user.id}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number | null; total_krw_enc: string | null }[]);
    const startKrw = snaps[0]?.total_krw_enc ? (decryptNum(snaps[0].total_krw_enc) ?? null) : (snaps[0]?.total_krw ?? null);
    resolvedStartUsd = startKrw ? startKrw / exchangeRate : null;
  }

  let returnTargetPct = body.returnTargetPct ?? null;
  let valueTargetUsd = body.valueTargetUsd ?? null;

  if (valueTargetUsd !== null && returnTargetPct === null && resolvedStartUsd) {
    returnTargetPct = ((valueTargetUsd - resolvedStartUsd) / resolvedStartUsd) * 100;
  } else if (returnTargetPct !== null && valueTargetUsd === null && resolvedStartUsd) {
    valueTargetUsd = resolvedStartUsd * (1 + returnTargetPct / 100);
  }

  if (returnTargetPct === null && valueTargetUsd !== null) returnTargetPct = 0;
  if (returnTargetPct === null) return NextResponse.json({ error: "목표값 필요" }, { status: 400 });

  const rows = await sql`
    INSERT INTO annual_goals (year, return_target_pct, value_target_usd, start_value_usd, note, user_id)
    VALUES (${year}, ${returnTargetPct}, ${valueTargetUsd}, ${resolvedStartUsd}, ${note ?? null}, ${user.id})
    ON CONFLICT (user_id, year) DO UPDATE SET
      return_target_pct = EXCLUDED.return_target_pct,
      value_target_usd  = EXCLUDED.value_target_usd,
      start_value_usd   = EXCLUDED.start_value_usd,
      note              = EXCLUDED.note
    RETURNING *
  ` as unknown as GoalRow[];

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const year = Number(req.nextUrl.searchParams.get("year"));
  await sql`DELETE FROM annual_goals WHERE year = ${year} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
