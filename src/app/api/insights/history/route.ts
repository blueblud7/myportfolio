import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS insight_history (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      analysis TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  const rows = await sql`
    SELECT id, question, analysis, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
    FROM insight_history
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { question, analysis } = await req.json();
  if (!question || !analysis) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS insight_history (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      analysis TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  const [row] = await sql`
    INSERT INTO insight_history (question, analysis)
    VALUES (${question}, ${analysis})
    RETURNING id, question, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
  `;
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM insight_history WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
