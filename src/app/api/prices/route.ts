import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getQuotes } from "@/lib/yahoo-finance";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  const { tickers } = await req.json() as { tickers: string[] };
  if (!tickers?.length) return NextResponse.json({ error: "tickers required" }, { status: 400 });
  const quotes = await getQuotes(tickers);
  const sql = getDb();
  const today = format(new Date(), "yyyy-MM-dd");
  for (const q of quotes) {
    await sql`
      INSERT INTO price_history (ticker, price, change_pct, date) VALUES (${q.ticker}, ${q.price}, ${q.changePct}, ${today})
      ON CONFLICT (ticker, date) DO UPDATE SET price=${q.price}, change_pct=${q.changePct}
    `;
  }
  return NextResponse.json({ updated: quotes.length, quotes });
}

export async function GET(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  const sql = getDb();
  if (ticker) {
    const rows = await sql`SELECT * FROM price_history WHERE ticker=${ticker} ORDER BY date DESC LIMIT 30`;
    return NextResponse.json(rows);
  }
  const rows = await sql`
    SELECT ph.* FROM price_history ph
    INNER JOIN (SELECT ticker, MAX(date) as max_date FROM price_history GROUP BY ticker) latest
    ON ph.ticker=latest.ticker AND ph.date=latest.max_date
  `;
  return NextResponse.json(rows);
}
