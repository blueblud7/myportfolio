import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();
  const accounts = await sql`SELECT * FROM accounts ORDER BY id`;
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const { name, type, currency, broker } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    INSERT INTO accounts (name, type, currency, broker)
    VALUES (${name}, ${type}, ${currency ?? "KRW"}, ${broker ?? ""})
    RETURNING *
  `;
  return NextResponse.json(account, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name, type, currency, broker } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [account] = await sql`
    UPDATE accounts SET name=${name}, type=${type}, currency=${currency}, broker=${broker}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(account);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM accounts WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
