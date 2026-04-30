import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { decryptDiaryRow, type DiaryRow } from "@/lib/diary-crypto";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE diary SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
  // 암호화 컬럼
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS content_enc TEXT`;
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS mood_enc TEXT`;
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS title_enc TEXT`;
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS tags_enc TEXT`;

  // 레거시 평문 컬럼 NOT NULL 제거 (이제 _enc 컬럼에만 저장하므로)
  await sql`ALTER TABLE diary ALTER COLUMN title DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE diary ALTER COLUMN content DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE diary ALTER COLUMN mood DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE diary ALTER COLUMN tags DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE diary ALTER COLUMN created_at DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE diary ALTER COLUMN updated_at DROP NOT NULL`.catch(() => {});

  // 일회성 마이그레이션: 기존 평문 → 암호화
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_diary_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`
    SELECT id, title, content, mood, tags FROM diary
    WHERE content_enc IS NULL
  ` as { id: number; title: string | null; content: string | null; mood: string | null; tags: string | null }[];

  for (const r of rows) {
    await sql`
      UPDATE diary SET
        title_enc   = ${encrypt(r.title)},
        content_enc = ${encrypt(r.content)},
        mood_enc    = ${encrypt(r.mood)},
        tags_enc    = ${encrypt(r.tags)}
      WHERE id = ${r.id}
    `;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_diary_v1')`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const sql = getDb();
  await ensureSchema(sql);

  let entries: DiaryRow[];
  if (year && month) {
    const prefix = `${year}-${month.padStart(2, "0")}%`;
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} AND date LIKE ${prefix} ORDER BY date DESC, created_at DESC` as DiaryRow[];
  } else if (year) {
    const prefix = `${year}%`;
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} AND date LIKE ${prefix} ORDER BY date DESC, created_at DESC` as DiaryRow[];
  } else {
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} ORDER BY date DESC, created_at DESC` as DiaryRow[];
  }
  return NextResponse.json(entries.map(decryptDiaryRow));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, content, date, mood, tags } = await req.json();
  if (!title || !date) return NextResponse.json({ error: "title and date required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const [entry] = await sql`
    INSERT INTO diary (date, user_id, title_enc, content_enc, mood_enc, tags_enc, created_at, updated_at)
    VALUES (
      ${date},
      ${user.id},
      ${encrypt(String(title).trim())},
      ${encrypt(content ?? "")},
      ${encrypt(mood ?? "neutral")},
      ${encrypt(tags ?? "")},
      ${now},
      ${now}
    )
    RETURNING *
  ` as DiaryRow[];
  return NextResponse.json(decryptDiaryRow(entry), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, title, content, date, mood, tags } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);

  const [entry] = await sql`
    UPDATE diary
    SET title_enc=${encrypt(title)},
        content_enc=${encrypt(content ?? "")},
        date=${date},
        mood_enc=${encrypt(mood ?? "neutral")},
        tags_enc=${encrypt(tags ?? "")},
        updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
    WHERE id=${id} AND user_id=${user.id} RETURNING *
  ` as DiaryRow[];
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(decryptDiaryRow(entry));
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM diary WHERE id=${id} AND user_id=${user.id}`;
  return NextResponse.json({ success: true });
}

