import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getQuotes } from "@/lib/yahoo-finance";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tickers } = body as { tickers: string[] };

  if (!tickers || tickers.length === 0) {
    return NextResponse.json({ error: "tickers required" }, { status: 400 });
  }

  const quotes = await getQuotes(tickers);
  const db = getDb();
  const today = format(new Date(), "yyyy-MM-dd");

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO price_history (ticker, price, change_pct, date) VALUES (?, ?, ?, ?)"
  );

  const insertMany = db.transaction(() => {
    for (const q of quotes) {
      stmt.run(q.ticker, q.price, q.changePct, today);
    }
  });

  insertMany();

  return NextResponse.json({ updated: quotes.length, quotes });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");

  const db = getDb();

  if (ticker) {
    const prices = db
      .prepare("SELECT * FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT 30")
      .all(ticker);
    return NextResponse.json(prices);
  }

  const prices = db
    .prepare(
      `SELECT ph.* FROM price_history ph
       INNER JOIN (
         SELECT ticker, MAX(date) as max_date FROM price_history GROUP BY ticker
       ) latest ON ph.ticker = latest.ticker AND ph.date = latest.max_date`
    )
    .all();
  return NextResponse.json(prices);
}
