import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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

async function initUserIdColumn(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE watchlist SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getDb();
  await initUserIdColumn(sql);
  const rows = await sql`
    SELECT w.*,
      COALESCE(p.price, 0) AS current_price,
      COALESCE(p.change_pct, 0) AS change_pct
    FROM watchlist w
    LEFT JOIN price_history p ON w.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = w.ticker)
    WHERE w.user_id = ${user.id}
    ORDER BY w.id DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ticker, name, currency, target_buy_price, target_sell_price, tags, note } = await req.json();
  if (!ticker || !name) {
    return NextResponse.json({ error: "ticker, name required" }, { status: 400 });
  }
  const sql = getDb();
  try {
    const [row] = await sql`
      INSERT INTO watchlist (ticker, name, currency, target_buy_price, target_sell_price, tags, note, user_id)
      VALUES (
        ${ticker.trim().toUpperCase()}, ${name.trim()}, ${currency ?? "USD"},
        ${target_buy_price ?? null}, ${target_sell_price ?? null},
        ${tags ?? ""}, ${note ?? ""}, ${user.id}
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
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ticker, name, currency, target_buy_price, target_sell_price, tags, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    UPDATE watchlist SET
      ticker = ${ticker}, name = ${name}, currency = ${currency},
      target_buy_price = ${target_buy_price ?? null},
      target_sell_price = ${target_sell_price ?? null},
      tags = ${tags ?? ""}, note = ${note ?? ""}
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING *
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM watchlist WHERE id = ${id} AND user_id = ${user.id}`;
  return NextResponse.json({ success: true });
}
