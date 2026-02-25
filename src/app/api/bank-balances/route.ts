import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");

  const db = getDb();

  if (accountId) {
    const balances = db
      .prepare("SELECT * FROM bank_balances WHERE account_id = ? ORDER BY date DESC")
      .all(accountId);
    return NextResponse.json(balances);
  }

  const balances = db
    .prepare(
      `SELECT bb.*, a.name as account_name, a.currency
       FROM bank_balances bb
       JOIN accounts a ON bb.account_id = a.id
       ORDER BY bb.date DESC`
    )
    .all();
  return NextResponse.json(balances);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { account_id, balance, date, note } = body;

  if (!account_id || balance === undefined || !date) {
    return NextResponse.json({ error: "account_id, balance, date required" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare("INSERT INTO bank_balances (account_id, balance, date, note) VALUES (?, ?, ?, ?)")
    .run(account_id, balance, date, note ?? "");

  const row = db.prepare("SELECT * FROM bank_balances WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, balance, date, note } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("UPDATE bank_balances SET balance = ?, date = ?, note = ? WHERE id = ?").run(
    balance,
    date,
    note,
    id
  );

  const row = db.prepare("SELECT * FROM bank_balances WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM bank_balances WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
