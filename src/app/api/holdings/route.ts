import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();

  const rows = accountId
    ? await sql`
        SELECT h.*,
          CASE WHEN h.manual_price IS NOT NULL THEN h.manual_price
               WHEN h.ticker='CASH' THEN h.avg_cost
               ELSE COALESCE(p.price,0) END as current_price,
          CASE WHEN h.manual_price IS NOT NULL THEN 0
               WHEN h.ticker='CASH' THEN 0
               ELSE COALESCE(p.change_pct,0) END as change_pct
        FROM holdings h
        LEFT JOIN price_history p ON h.ticker=p.ticker
          AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
        WHERE h.account_id=${accountId} ORDER BY h.id`
    : await sql`
        SELECT h.*,
          CASE WHEN h.manual_price IS NOT NULL THEN h.manual_price
               WHEN h.ticker='CASH' THEN h.avg_cost
               ELSE COALESCE(p.price,0) END as current_price,
          CASE WHEN h.manual_price IS NOT NULL THEN 0
               WHEN h.ticker='CASH' THEN 0
               ELSE COALESCE(p.change_pct,0) END as change_pct
        FROM holdings h
        LEFT JOIN price_history p ON h.ticker=p.ticker
          AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
        ORDER BY h.id`;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = await req.json();
  if (!account_id || !ticker || !name)
    return NextResponse.json({ error: "account_id, ticker, name required" }, { status: 400 });
  const sql = getDb();
  const holdingDate = date ?? new Date().toISOString().slice(0, 10);
  const [holding] = await sql`
    INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date)
    VALUES (${account_id}, ${ticker.trim()}, ${name.trim()}, ${quantity ?? 0}, ${avg_cost ?? 0},
            ${currency ?? "KRW"}, ${note ?? ""}, ${manual_price ?? null}, ${holdingDate})
    RETURNING *
  `;
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const existing = await sql`SELECT date FROM holdings WHERE id=${id}`;
  const holdingDate = date ?? (existing[0] as { date: string } | undefined)?.date ?? new Date().toISOString().slice(0, 10);
  const [holding] = await sql`
    UPDATE holdings SET ticker=${ticker}, name=${name}, quantity=${quantity}, avg_cost=${avg_cost},
      currency=${currency}, note=${note ?? ""}, manual_price=${manual_price ?? null}, date=${holdingDate}
    WHERE id=${id} RETURNING *
  `;
  return NextResponse.json(holding);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM holdings WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
