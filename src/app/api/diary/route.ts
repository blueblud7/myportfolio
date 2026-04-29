import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function initUserIdColumn(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE diary SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const sql = getDb();
  await initUserIdColumn(sql);

  let entries;
  if (year && month) {
    const prefix = `${year}-${month.padStart(2, "0")}%`;
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} AND date LIKE ${prefix} ORDER BY date DESC, created_at DESC`;
  } else if (year) {
    const prefix = `${year}%`;
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} AND date LIKE ${prefix} ORDER BY date DESC, created_at DESC`;
  } else {
    entries = await sql`SELECT * FROM diary WHERE user_id=${user.id} ORDER BY date DESC, created_at DESC`;
  }
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, content, date, mood, tags } = await req.json();
  if (!title || !date) return NextResponse.json({ error: "title and date required" }, { status: 400 });
  const sql = getDb();
  const [entry] = await sql`
    INSERT INTO diary (title, content, date, mood, tags, user_id)
    VALUES (${title.trim()}, ${content ?? ""}, ${date}, ${mood ?? "neutral"}, ${tags ?? ""}, ${user.id})
    RETURNING *
  `;
  return NextResponse.json(entry, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, title, content, date, mood, tags } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [entry] = await sql`
    UPDATE diary
    SET title=${title}, content=${content ?? ""}, date=${date},
        mood=${mood ?? "neutral"}, tags=${tags ?? ""},
        updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
    WHERE id=${id} AND user_id=${user.id} RETURNING *
  `;
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entry);
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
