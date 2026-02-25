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
                COALESCE(p.price, 0) as current_price,
                COALESCE(p.change_pct, 0) as change_pct
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
              COALESCE(p.price, 0) as current_price,
              COALESCE(p.change_pct, 0) as change_pct
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
  const { account_id, ticker, name, quantity, avg_cost, currency } = body;

  if (!account_id || !ticker || !name) {
    return NextResponse.json({ error: "account_id, ticker, name required" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(account_id, ticker.trim(), name.trim(), quantity ?? 0, avg_cost ?? 0, currency ?? "KRW");

  const holding = db.prepare("SELECT * FROM holdings WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ticker, name, quantity, avg_cost, currency } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    "UPDATE holdings SET ticker = ?, name = ?, quantity = ?, avg_cost = ?, currency = ? WHERE id = ?"
  ).run(ticker, name, quantity, avg_cost, currency, id);

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
