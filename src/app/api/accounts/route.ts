import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts ORDER BY id").all();
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, type, currency, broker } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "name and type required" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare("INSERT INTO accounts (name, type, currency, broker) VALUES (?, ?, ?, ?)")
    .run(name, type, currency ?? "KRW", broker ?? "");

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(account, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, type, currency, broker } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    "UPDATE accounts SET name = ?, type = ?, currency = ?, broker = ? WHERE id = ?"
  ).run(name, type, currency, broker, id);

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  return NextResponse.json(account);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
