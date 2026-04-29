import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function initColumns(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  await sql`UPDATE accounts SET sort_order = id WHERE sort_order IS NULL`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner TEXT`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  // 유저가 1명뿐이면 기존 데이터 자동 귀속
  await sql`
    UPDATE accounts SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getDb();
  await initColumns(sql);
  const accounts = await sql`SELECT * FROM accounts WHERE user_id = ${user.id} ORDER BY sort_order ASC, id ASC`;
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, type, currency, broker, owner } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    INSERT INTO accounts (name, type, currency, broker, target_pct, owner, user_id)
    VALUES (${name}, ${type}, ${currency ?? "KRW"}, ${broker ?? ""}, 0, ${owner ?? null}, ${user.id})
    RETURNING *
  `;
  return NextResponse.json(account, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, name, type, currency, broker, target_pct, owner } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    UPDATE accounts SET name=${name}, type=${type}, currency=${currency}, broker=${broker},
      target_pct=${target_pct ?? 0}, owner=${owner ?? null}
    WHERE id=${id} AND user_id=${user.id} RETURNING *
  `;
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items: { id: number; sort_order: number }[] = await req.json();
  const sql = getDb();
  await Promise.all(
    items.map(({ id, sort_order }) =>
      sql`UPDATE accounts SET sort_order = ${sort_order} WHERE id = ${id} AND user_id = ${user.id}`
    )
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM accounts WHERE id=${id} AND user_id=${user.id}`;
  return NextResponse.json({ success: true });
}
