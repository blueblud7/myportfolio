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
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // 기존 테이블에 컬럼 없으면 추가
  await sql`ALTER TABLE annual_goals ADD COLUMN IF NOT EXISTS value_target_usd NUMERIC`.catch(() => {});
}

export async function GET() {
  await ensureTable();
  const sql = getDb();
  const year = new Date().getFullYear();

  const [goals, startSnaps, latestSnaps, exchangeRate] = await Promise.all([
    sql`SELECT * FROM annual_goals ORDER BY year DESC`.then(
      (r) => r as unknown as { id: number; year: number; return_target_pct: number; value_target_usd: number | null; note: string | null }[]
    ),
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

  const startKrw = startSnaps[0]?.total_krw ? Number(startSnaps[0].total_krw) : null;
  const currentKrw = latestSnaps[0]?.total_krw ? Number(latestSnaps[0].total_krw) : null;
  const startUsd = startKrw ? startKrw / exchangeRate : null;
  const currentUsd = currentKrw ? currentKrw / exchangeRate : null;

  const ytdPct =
    startKrw && currentKrw && startKrw > 0
      ? ((currentKrw - startKrw) / startKrw) * 100
      : null;

  const now = new Date();
  const yearEnd = new Date(year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / 86400000));
  const daysPassed = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
  const totalDays = daysPassed + daysLeft;

  return NextResponse.json({
    goals,
    currentGoal: goals.find((g) => g.year === year) ?? null,
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
    note?: string;
  };

  const { year, note } = body;

  // 둘 중 하나로 나머지 역산 — startUsd 기준
  let returnTargetPct = body.returnTargetPct ?? null;
  let valueTargetUsd = body.valueTargetUsd ?? null;

  if (valueTargetUsd !== null && returnTargetPct === null) {
    // $목표 → % 역산: startUsd 필요
    const exchangeRate = await getCachedExchangeRate();
    const snaps = await sql`
      SELECT total_krw FROM snapshots
      WHERE date >= ${`${year}-01-01`}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number }[]);
    const startKrw = snaps[0]?.total_krw ? Number(snaps[0].total_krw) : null;
    const startUsd = startKrw ? startKrw / exchangeRate : null;
    if (startUsd && startUsd > 0) {
      returnTargetPct = ((valueTargetUsd - startUsd) / startUsd) * 100;
    } else {
      returnTargetPct = 0;
    }
  } else if (returnTargetPct !== null && valueTargetUsd === null) {
    // % 입력 → $목표 역산
    const exchangeRate = await getCachedExchangeRate();
    const snaps = await sql`
      SELECT total_krw FROM snapshots
      WHERE date >= ${`${year}-01-01`}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number }[]);
    const startKrw = snaps[0]?.total_krw ? Number(snaps[0].total_krw) : null;
    const startUsd = startKrw ? startKrw / exchangeRate : null;
    if (startUsd) {
      valueTargetUsd = startUsd * (1 + returnTargetPct / 100);
    }
  }

  if (returnTargetPct === null) return NextResponse.json({ error: "목표값 필요" }, { status: 400 });

  const rows = await sql`
    INSERT INTO annual_goals (year, return_target_pct, value_target_usd, note)
    VALUES (${year}, ${returnTargetPct}, ${valueTargetUsd}, ${note ?? null})
    ON CONFLICT (year) DO UPDATE SET
      return_target_pct = EXCLUDED.return_target_pct,
      value_target_usd  = EXCLUDED.value_target_usd,
      note              = EXCLUDED.note
    RETURNING *
  ` as unknown as { id: number; year: number; return_target_pct: number; value_target_usd: number | null; note: string | null }[];

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  await ensureTable();
  const sql = getDb();
  const year = Number(req.nextUrl.searchParams.get("year"));
  await sql`DELETE FROM annual_goals WHERE year = ${year}`;
  return NextResponse.json({ ok: true });
}
