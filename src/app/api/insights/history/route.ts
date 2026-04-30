import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt, tryDecrypt } from "@/lib/crypto";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS insight_history (
      id SERIAL PRIMARY KEY,
      question TEXT,
      analysis TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE insight_history ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`.catch(() => {});
  await sql`ALTER TABLE insight_history ADD COLUMN IF NOT EXISTS question_enc TEXT`;
  await sql`ALTER TABLE insight_history ADD COLUMN IF NOT EXISTS analysis_enc TEXT`;
  // 레거시 NOT NULL 제거
  await sql`ALTER TABLE insight_history ALTER COLUMN question DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE insight_history ALTER COLUMN analysis DROP NOT NULL`.catch(() => {});

  // 일회성 마이그레이션
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_insight_history_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`SELECT id, question, analysis FROM insight_history WHERE question_enc IS NULL` as {
    id: number; question: string | null; analysis: string | null;
  }[];
  for (const r of rows) {
    await sql`
      UPDATE insight_history SET
        question_enc = ${encrypt(r.question)},
        analysis_enc = ${encrypt(r.analysis)}
      WHERE id = ${r.id}
    `;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_insight_history_v1')`;
}

interface InsightHistoryRow {
  id: number;
  question: string | null;
  analysis: string | null;
  question_enc: string | null;
  analysis_enc: string | null;
  created_at: string;
}

function decryptRow(r: InsightHistoryRow) {
  return {
    id: r.id,
    question: r.question_enc ? tryDecrypt(r.question_enc) : r.question,
    analysis: r.analysis_enc ? tryDecrypt(r.analysis_enc) : r.analysis,
    created_at: r.created_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, question, analysis, question_enc, analysis_enc,
           to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
    FROM insight_history
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  ` as InsightHistoryRow[];
  return NextResponse.json(rows.map(decryptRow));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, analysis } = await req.json();
  if (!question || !analysis) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const sql = getDb();
  await ensureSchema(sql);
  const [row] = await sql`
    INSERT INTO insight_history (question_enc, analysis_enc, user_id)
    VALUES (${encrypt(question)}, ${encrypt(analysis)}, ${user.id})
    RETURNING id, question, analysis, question_enc, analysis_enc, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
  ` as InsightHistoryRow[];
  return NextResponse.json(decryptRow(row), { status: 201 });
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
