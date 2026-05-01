import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt, encryptNum } from "@/lib/crypto";
import { decryptHoldingFields, type HoldingEncFields } from "@/lib/holdings-crypto";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`;
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`;
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`;
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS note_enc TEXT`;
  await sql`ALTER TABLE holdings ALTER COLUMN quantity DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE holdings ALTER COLUMN avg_cost DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE holdings ALTER COLUMN note DROP NOT NULL`.catch(() => {});

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_holdings_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`
    SELECT id, quantity, avg_cost, manual_price, note FROM holdings WHERE quantity_enc IS NULL
  ` as { id: number; quantity: number | null; avg_cost: number | null; manual_price: number | null; note: string | null }[];
  for (const r of rows) {
    await sql`
      UPDATE holdings SET
        quantity_enc = ${encryptNum(r.quantity)},
        avg_cost_enc = ${encryptNum(r.avg_cost)},
        manual_price_enc = ${encryptNum(r.manual_price)},
        note_enc = ${encrypt(r.note)}
      WHERE id = ${r.id}
    `;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_holdings_v1')`;
}

interface HoldingRow extends HoldingEncFields {
  id: number;
  account_id: number;
  ticker: string;
  name: string;
  currency: string;
  date: string;
  current_price?: number;
  change_pct?: number;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();
  await ensureSchema(sql);

  // current_price/change_pct는 SQL CASE에서 평문 manual_price/avg_cost에 의존했었음.
  // 암호화 후엔 일단 0으로 두고 JS에서 복호화 후 계산.
  const rows = accountId
    ? await sql`
        SELECT h.*,
          COALESCE(p.price, 0) as price_market,
          COALESCE(p.change_pct, 0) as price_change_pct
        FROM holdings h
        JOIN accounts a ON h.account_id = a.id
        LEFT JOIN price_history p ON h.ticker=p.ticker
          AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
        WHERE h.account_id=${accountId} AND a.user_id=${user.id}
        ORDER BY h.id`
    : await sql`
        SELECT h.*,
          COALESCE(p.price, 0) as price_market,
          COALESCE(p.change_pct, 0) as price_change_pct
        FROM holdings h
        JOIN accounts a ON h.account_id = a.id
        LEFT JOIN price_history p ON h.ticker=p.ticker
          AND p.date=(SELECT MAX(date) FROM price_history WHERE ticker=h.ticker)
        WHERE a.user_id=${user.id}
        ORDER BY h.id`;

  const decrypted = (rows as (HoldingRow & { price_market: number; price_change_pct: number })[]).map((r) => {
    const d = decryptHoldingFields(r);
    const manual = d.manual_price;
    const current_price =
      manual !== null && manual !== undefined ? manual :
      r.ticker === "CASH" ? (d.avg_cost ?? 0) :
      (r.price_market || 0);
    const change_pct =
      manual !== null && manual !== undefined ? 0 :
      r.ticker === "CASH" ? 0 :
      (r.price_change_pct || 0);
    return { ...d, current_price, change_pct };
  });

  return NextResponse.json(decrypted);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account_id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = await req.json();
  if (!account_id || !ticker || !name)
    return NextResponse.json({ error: "account_id, ticker, name required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const owns = await sql`SELECT id FROM accounts WHERE id=${account_id} AND user_id=${user.id}`;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const holdingDate = date ?? new Date().toISOString().slice(0, 10);
  const [holding] = await sql`
    INSERT INTO holdings (
      account_id, ticker, name, currency, date,
      quantity_enc, avg_cost_enc, note_enc, manual_price_enc
    )
    VALUES (
      ${account_id}, ${ticker.trim()}, ${name.trim()}, ${currency ?? "KRW"}, ${holdingDate},
      ${encryptNum(Number(quantity ?? 0))}, ${encryptNum(Number(avg_cost ?? 0))},
      ${encrypt(note ?? "")}, ${manual_price !== null && manual_price !== undefined ? encryptNum(Number(manual_price)) : null}
    )
    RETURNING *
  ` as HoldingRow[];
  return NextResponse.json(decryptHoldingFields(holding), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ticker, name, quantity, avg_cost, currency, note, manual_price, date } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const existing = await sql`
    SELECT h.date FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    WHERE h.id=${id} AND a.user_id=${user.id}
  `;
  if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const holdingDate = date ?? (existing[0] as { date: string }).date ?? new Date().toISOString().slice(0, 10);
  const [holding] = await sql`
    UPDATE holdings SET
      ticker=${ticker}, name=${name}, currency=${currency}, date=${holdingDate},
      quantity_enc=${encryptNum(Number(quantity ?? 0))},
      avg_cost_enc=${encryptNum(Number(avg_cost ?? 0))},
      note_enc=${encrypt(note ?? "")},
      manual_price_enc=${manual_price !== null && manual_price !== undefined ? encryptNum(Number(manual_price)) : null}
    WHERE id=${id} RETURNING *
  ` as HoldingRow[];
  return NextResponse.json(decryptHoldingFields(holding));
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT h.id FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    WHERE h.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM holdings WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
