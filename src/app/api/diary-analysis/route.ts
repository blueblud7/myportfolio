import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();

  // Diary counts per mood
  const moodCounts = await sql`SELECT mood, COUNT(*) as count FROM diary GROUP BY mood`;

  // Transactions joined with diary entries by same date
  const joined = await sql`
    SELECT d.mood, t.type as tx_type, t.total_amount, t.currency
    FROM diary d
    LEFT JOIN transactions t ON t.date = d.date
  `;

  const moods = ["great", "good", "neutral", "bad", "terrible"] as const;

  const analysis = moods.map((mood) => {
    const countRow = moodCounts.find((r) => r.mood === mood);
    const diaryCount = Number(countRow?.count ?? 0);

    const moodRows = joined.filter((r) => r.mood === mood && r.tx_type);
    const buyRows = moodRows.filter((r) => r.tx_type === "buy");
    const sellRows = moodRows.filter((r) => r.tx_type === "sell");

    const totalBuy = buyRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const totalSell = sellRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

    return {
      mood,
      diary_count: diaryCount,
      buy_count: buyRows.length,
      sell_count: sellRows.length,
      avg_buy_amount: buyRows.length > 0 ? totalBuy / buyRows.length : 0,
      avg_sell_amount: sellRows.length > 0 ? totalSell / sellRows.length : 0,
      total_tx_count: moodRows.length,
    };
  });

  return NextResponse.json(analysis);
}
