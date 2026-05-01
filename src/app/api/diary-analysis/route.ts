import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { tryDecrypt, decryptNum } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();

  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_amount_enc TEXT`.catch(() => {});

  // 일기 + 같은 날짜의 본인 거래 — mood/total_amount는 암호화되어 있어 JS에서 집계
  const rows = await sql`
    SELECT d.mood_enc, d.mood, t.type as tx_type, t.total_amount, t.total_amount_enc, t.currency
    FROM diary d
    LEFT JOIN transactions t ON t.date = d.date
      AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ${user.id})
    WHERE d.user_id = ${user.id}
  ` as { mood_enc: string | null; mood: string | null; tx_type: string | null; total_amount: number | null; total_amount_enc: string | null; currency: string | null }[];

  const decoded = rows.map(r => ({
    mood: r.mood_enc ? tryDecrypt(r.mood_enc) : r.mood,
    tx_type: r.tx_type,
    total_amount: r.total_amount_enc ? (decryptNum(r.total_amount_enc) ?? 0) : (r.total_amount ?? 0),
    currency: r.currency,
  }));

  const moods = ["great", "good", "neutral", "bad", "terrible"] as const;

  // diary count는 distinct rows가 아니라서 별도로 가져와야 함
  // (JOIN으로 같은 일기가 여러 거래와 매칭되면 중복 카운트되므로)
  const diaryRows = await sql`
    SELECT mood_enc, mood FROM diary WHERE user_id = ${user.id}
  ` as { mood_enc: string | null; mood: string | null }[];
  const diaryDecoded = diaryRows.map(r => r.mood_enc ? tryDecrypt(r.mood_enc) : r.mood);
  const diaryCountByMood = new Map<string, number>();
  for (const m of diaryDecoded) {
    if (!m) continue;
    diaryCountByMood.set(m, (diaryCountByMood.get(m) ?? 0) + 1);
  }

  const analysis = moods.map((mood) => {
    const moodRows = decoded.filter((r) => r.mood === mood && r.tx_type);
    const buyRows = moodRows.filter((r) => r.tx_type === "buy");
    const sellRows = moodRows.filter((r) => r.tx_type === "sell");

    const totalBuy = buyRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const totalSell = sellRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

    return {
      mood,
      diary_count: diaryCountByMood.get(mood) ?? 0,
      buy_count: buyRows.length,
      sell_count: sellRows.length,
      avg_buy_amount: buyRows.length > 0 ? totalBuy / buyRows.length : 0,
      avg_sell_amount: sellRows.length > 0 ? totalSell / sellRows.length : 0,
      total_tx_count: moodRows.length,
    };
  });

  return NextResponse.json(analysis);
}
