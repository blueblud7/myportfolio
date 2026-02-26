import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");

  const db = getDb();

  if (accountId) {
    const holdings = db
      .prepare(
        `SELECT h.*,
                CASE WHEN h.manual_price IS NOT NULL THEN h.manual_price
                     WHEN h.ticker = 'CASH' THEN h.avg_cost
                     ELSE COALESCE(p.price, 0)
                END as current_price,
                CASE WHEN h.manual_price IS NOT NULL THEN 0
                     WHEN h.ticker = 'CASH' THEN 0
                     ELSE COALESCE(p.change_pct, 0)
                END as change_pct
         FROM holdings h
         LEFT JOIN price_history p ON h.ticker = p.ticker
           AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
         WHERE h.account_id = ?
         ORDER BY h.id`
      )
      .all(accountId);
    return NextResponse.json(holdings);
  }

  const holdings = db
    .prepare(
      `SELECT h.*,
              CASE WHEN h.manual_price IS NOT NULL THEN h.manual_price
                   WHEN h.ticker = 'CASH' THEN h.avg_cost
                   ELSE COALESCE(p.price, 0)
              END as current_price,
              CASE WHEN h.manual_price IS NOT NULL THEN 0
                   WHEN h.ticker = 'CASH' THEN 0
                   ELSE COALESCE(p.change_pct, 0)
              END as change_pct
       FROM holdings h
       LEFT JOIN price_history p ON h.ticker = p.ticker
         AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
       ORDER BY h.id`
    )
    .all();
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = body;

  if (!account_id || !ticker || !name) {
    return NextResponse.json({ error: "account_id, ticker, name required" }, { status: 400 });
  }

  const db = getDb();
  const holdingDate = date ?? new Date().toISOString().slice(0, 10);
  const result = db
    .prepare(
      "INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(account_id, ticker.trim(), name.trim(), quantity ?? 0, avg_cost ?? 0, currency ?? "KRW", note ?? "", manual_price ?? null, holdingDate);

  const holding = db.prepare("SELECT * FROM holdings WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT date FROM holdings WHERE id = ?").get(id) as { date: string } | undefined;
  const holdingDate = date ?? existing?.date ?? new Date().toISOString().slice(0, 10);
  db.prepare(
    "UPDATE holdings SET ticker = ?, name = ?, quantity = ?, avg_cost = ?, currency = ?, note = ?, manual_price = ?, date = ? WHERE id = ?"
  ).run(ticker, name, quantity, avg_cost, currency, note ?? "", manual_price ?? null, holdingDate, id);

  const holding = db.prepare("SELECT * FROM holdings WHERE id = ?").get(id);
  return NextResponse.json(holding);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM holdings WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
