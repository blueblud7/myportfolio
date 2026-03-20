import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  await sql`UPDATE accounts SET sort_order = id WHERE sort_order IS NULL`;
  const accounts = await sql`SELECT * FROM accounts ORDER BY sort_order ASC, id ASC`;
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const { name, type, currency, broker } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    INSERT INTO accounts (name, type, currency, broker, target_pct)
    VALUES (${name}, ${type}, ${currency ?? "KRW"}, ${broker ?? ""}, 0)
    RETURNING *
  `;
  return NextResponse.json(account, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name, type, currency, broker, target_pct } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    UPDATE accounts SET name=${name}, type=${type}, currency=${currency}, broker=${broker},
      target_pct=${target_pct ?? 0}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(account);
}

export async function PATCH(req: NextRequest) {
  const items: { id: number; sort_order: number }[] = await req.json();
  const sql = getDb();
  await Promise.all(
    items.map(({ id, sort_order }) =>
      sql`UPDATE accounts SET sort_order = ${sort_order} WHERE id = ${id}`
    )
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM accounts WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
