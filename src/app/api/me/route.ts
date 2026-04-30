import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getDb();
  const expenses = await sql`
    SELECT id, name, amount, user_id FROM expense_items
    WHERE user_id = ${user.id} ORDER BY sort_order LIMIT 5
  `;
  const allUsers = await sql`SELECT id, username FROM users ORDER BY id`;
  return NextResponse.json({ currentUser: user, sample_expenses: expenses, allUsers });
}
