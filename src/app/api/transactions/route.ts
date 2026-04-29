import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { Transaction } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncHoldings(sql: any, tx: Transaction) {
  if (tx.type === "buy") {
    const existing = await sql`
      SELECT * FROM holdings WHERE account_id=${tx.account_id} AND ticker=${tx.ticker}`;
    if (existing.length > 0) {
      const h = existing[0];
      const newQty = h.quantity + tx.quantity;
      const newAvg = (h.quantity * h.avg_cost + tx.quantity * tx.price) / newQty;
      await sql`UPDATE holdings SET quantity=${newQty}, avg_cost=${newAvg} WHERE id=${h.id}`;
    } else {
      await sql`
        INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency, note, date)
        VALUES (${tx.account_id}, ${tx.ticker}, ${tx.name}, ${tx.quantity}, ${tx.price}, ${tx.currency}, '', ${tx.date})`;
    }
  } else if (tx.type === "sell") {
    const existing = await sql`
      SELECT * FROM holdings WHERE account_id=${tx.account_id} AND ticker=${tx.ticker}`;
    if (existing.length > 0) {
      const h = existing[0];
      const newQty = h.quantity - tx.quantity;
      if (newQty <= 0.0001) {
        await sql`DELETE FROM holdings WHERE id=${h.id}`;
      } else {
        await sql`UPDATE holdings SET quantity=${newQty} WHERE id=${h.id}`;
      }
    }
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();

  const rows = accountId
    ? await sql`
        SELECT t.* FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id=${accountId} AND a.user_id=${user.id}
        ORDER BY t.date DESC, t.id DESC`
    : await sql`
        SELECT t.* FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id=${user.id}
        ORDER BY t.date DESC, t.id DESC`;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { account_id, type, ticker, name, quantity, price, fees, currency, date, note } = body;

  if (!account_id || !type || !date)
    return NextResponse.json({ error: "account_id, type, date required" }, { status: 400 });

  const sql = getDb();
  const owns = await sql`SELECT id FROM accounts WHERE id=${account_id} AND user_id=${user.id}`;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalAmount = (quantity ?? 0) * (price ?? 0) + (fees ?? 0);
  const [tx] = await sql`
    INSERT INTO transactions (account_id, type, ticker, name, quantity, price, fees, total_amount, currency, date, note)
    VALUES (
      ${account_id}, ${type}, ${ticker ?? ""}, ${name ?? ""},
      ${quantity ?? 0}, ${price ?? 0}, ${fees ?? 0}, ${totalAmount},
      ${currency ?? "KRW"}, ${date}, ${note ?? ""}
    )
    RETURNING *
  `;

  await syncHoldings(sql, tx as Transaction);
  return NextResponse.json(tx, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT t.id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [tx] = await sql`
    UPDATE transactions SET date=${date}, note=${note ?? ""}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT t.id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM transactions WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
