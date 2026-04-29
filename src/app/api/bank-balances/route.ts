import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();
  if (accountId) {
    const rows = await sql`
      SELECT bb.* FROM bank_balances bb
      JOIN accounts a ON bb.account_id = a.id
      WHERE bb.account_id=${accountId} AND a.user_id=${user.id}
      ORDER BY bb.date DESC
    `;
    return NextResponse.json(rows);
  }
  const rows = await sql`
    SELECT bb.*, a.name as account_name, a.currency
    FROM bank_balances bb JOIN accounts a ON bb.account_id=a.id
    WHERE a.user_id=${user.id}
    ORDER BY bb.date DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account_id, balance, date, note } = await req.json();
  if (!account_id || balance === undefined || !date)
    return NextResponse.json({ error: "account_id, balance, date required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`SELECT id FROM accounts WHERE id=${account_id} AND user_id=${user.id}`;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await sql`
    INSERT INTO bank_balances (account_id, balance, date, note)
    VALUES (${account_id}, ${balance}, ${date}, ${note ?? ""}) RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, balance, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT bb.id FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await sql`
    UPDATE bank_balances SET balance=${balance}, date=${date}, note=${note} WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT bb.id FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM bank_balances WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
