import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();
  if (accountId) {
    const rows = await sql`SELECT * FROM bank_balances WHERE account_id=${accountId} ORDER BY date DESC`;
    return NextResponse.json(rows);
  }
  const rows = await sql`
    SELECT bb.*, a.name as account_name, a.currency
    FROM bank_balances bb JOIN accounts a ON bb.account_id=a.id
    ORDER BY bb.date DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { account_id, balance, date, note } = await req.json();
  if (!account_id || balance === undefined || !date)
    return NextResponse.json({ error: "account_id, balance, date required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO bank_balances (account_id, balance, date, note)
    VALUES (${account_id}, ${balance}, ${date}, ${note ?? ""}) RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, balance, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    UPDATE bank_balances SET balance=${balance}, date=${date}, note=${note} WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM bank_balances WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
