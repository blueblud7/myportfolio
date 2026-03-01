import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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
  // dividend/deposit/withdrawal → holdings 변경 없음
}

export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();

  const rows = accountId
    ? await sql`SELECT * FROM transactions WHERE account_id=${accountId} ORDER BY date DESC, id DESC`
    : await sql`SELECT * FROM transactions ORDER BY date DESC, id DESC`;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { account_id, type, ticker, name, quantity, price, fees, currency, date, note } = body;

  if (!account_id || !type || !date)
    return NextResponse.json({ error: "account_id, type, date required" }, { status: 400 });

  const sql = getDb();
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
  const { id, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sql = getDb();
  const [tx] = await sql`
    UPDATE transactions SET date=${date}, note=${note ?? ""}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sql = getDb();
  await sql`DELETE FROM transactions WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
