import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const sql = getDb();

  let rows;
  if (start && end) {
    rows = await sql`
      SELECT as2.account_id, as2.value_krw, as2.date, a.name, a.type, a.currency
      FROM account_snapshots as2
      JOIN accounts a ON as2.account_id = a.id
      WHERE a.user_id = ${user.id} AND as2.date >= ${start} AND as2.date <= ${end}
      ORDER BY as2.date
    `;
  } else {
    rows = await sql`
      SELECT as2.account_id, as2.value_krw, as2.date, a.name, a.type, a.currency
      FROM account_snapshots as2
      JOIN accounts a ON as2.account_id = a.id
      WHERE a.user_id = ${user.id}
      ORDER BY as2.date
    `;
  }

  return NextResponse.json(rows);
}
