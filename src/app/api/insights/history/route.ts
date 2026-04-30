import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS insight_history (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      analysis TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE insight_history ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`.catch(() => {});
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const rows = await sql`
    SELECT id, question, analysis, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
    FROM insight_history
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, analysis } = await req.json();
  if (!question || !analysis) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const sql = getDb();
  await ensureTable(sql);
  const [row] = await sql`
    INSERT INTO insight_history (question, analysis, user_id)
    VALUES (${question}, ${analysis}, ${user.id})
    RETURNING id, question, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
  `;
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sql = getDb();
  await sql`DELETE FROM insight_history WHERE id = ${id} AND user_id = ${user.id}`;
  return NextResponse.json({ success: true });
}
