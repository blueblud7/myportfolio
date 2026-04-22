import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS annual_goals (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL UNIQUE,
      return_target_pct NUMERIC NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET() {
  await ensureTable();
  const sql = getDb();
  const year = new Date().getFullYear();

  const goals = await sql`SELECT * FROM annual_goals ORDER BY year DESC` as unknown as
    { id: number; year: number; return_target_pct: number; note: string | null }[];

  const [startSnaps, latestSnaps] = await Promise.all([
    sql`
      SELECT total_krw, date FROM snapshots
      WHERE date >= ${`${year}-01-01`}
      ORDER BY date ASC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number; date: string }[]),
    sql`
      SELECT total_krw, date FROM snapshots
      ORDER BY date DESC LIMIT 1
    `.then((r) => r as unknown as { total_krw: number; date: string }[]),
  ]);

  const startValue = startSnaps[0]?.total_krw ? Number(startSnaps[0].total_krw) : null;
  const currentValue = latestSnaps[0]?.total_krw ? Number(latestSnaps[0].total_krw) : null;
  const ytdPct =
    startValue && currentValue && startValue > 0
      ? ((currentValue - startValue) / startValue) * 100
      : null;

  const now = new Date();
  const yearEnd = new Date(year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / 86400000));
  const daysPassed = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
  const totalDays = daysPassed + daysLeft;

  return NextResponse.json({
    goals,
    currentGoal: goals.find((g) => g.year === year) ?? null,
    ytd: { startValue, currentValue, returnPct: ytdPct },
    daysLeft,
    daysPassed,
    totalDays,
    year,
  });
}

export async function POST(req: NextRequest) {
  await ensureTable();
  const sql = getDb();
  const { year, returnTargetPct, note } = (await req.json()) as {
    year: number;
    returnTargetPct: number;
    note?: string;
  };

  const rows = await sql`
    INSERT INTO annual_goals (year, return_target_pct, note)
    VALUES (${year}, ${returnTargetPct}, ${note ?? null})
    ON CONFLICT (year) DO UPDATE SET
      return_target_pct = EXCLUDED.return_target_pct,
      note = EXCLUDED.note
    RETURNING *
  ` as unknown as { id: number; year: number; return_target_pct: number; note: string | null }[];

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  await ensureTable();
  const sql = getDb();
  const year = Number(req.nextUrl.searchParams.get("year"));
  await sql`DELETE FROM annual_goals WHERE year = ${year}`;
  return NextResponse.json({ ok: true });
}
