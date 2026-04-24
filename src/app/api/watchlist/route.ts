import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface WatchlistItem {
  id: number;
  ticker: string;
  name: string;
  currency: "KRW" | "USD";
  target_buy_price: number | null;
  target_sell_price: number | null;
  tags: string;
  note: string;
  added_at: string;
  current_price: number;
  change_pct: number;
}

export async function GET() {
  const sql = getDb();
  const rows = await sql`
    SELECT w.*,
      COALESCE(p.price, 0) AS current_price,
      COALESCE(p.change_pct, 0) AS change_pct
    FROM watchlist w
    LEFT JOIN price_history p ON w.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = w.ticker)
    ORDER BY w.id DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { ticker, name, currency, target_buy_price, target_sell_price, tags, note } = await req.json();
  if (!ticker || !name) {
    return NextResponse.json({ error: "ticker, name required" }, { status: 400 });
  }
  const sql = getDb();
  try {
    const [row] = await sql`
      INSERT INTO watchlist (ticker, name, currency, target_buy_price, target_sell_price, tags, note)
      VALUES (
        ${ticker.trim().toUpperCase()}, ${name.trim()}, ${currency ?? "USD"},
        ${target_buy_price ?? null}, ${target_sell_price ?? null},
        ${tags ?? ""}, ${note ?? ""}
      )
      RETURNING *
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return NextResponse.json({ error: "이미 워치리스트에 있는 종목입니다" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { id, ticker, name, currency, target_buy_price, target_sell_price, tags, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    UPDATE watchlist SET
      ticker = ${ticker}, name = ${name}, currency = ${currency},
      target_buy_price = ${target_buy_price ?? null},
      target_sell_price = ${target_sell_price ?? null},
      tags = ${tags ?? ""}, note = ${note ?? ""}
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM watchlist WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
