import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt, encryptNum, decryptNum } from "@/lib/crypto";
import { decryptTransactionFields, type TransactionEncFields } from "@/lib/transactions-crypto";
import type { Transaction } from "@/types";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS quantity_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fees_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_amount_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note_enc TEXT`;
  await sql`ALTER TABLE transactions ALTER COLUMN quantity DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN price DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN fees DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN total_amount DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN note DROP NOT NULL`.catch(() => {});

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_transactions_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`
    SELECT id, quantity, price, fees, total_amount, note FROM transactions WHERE quantity_enc IS NULL
  ` as { id: number; quantity: number | null; price: number | null; fees: number | null; total_amount: number | null; note: string | null }[];
  for (const r of rows) {
    await sql`
      UPDATE transactions SET
        quantity_enc = ${encryptNum(r.quantity)},
        price_enc = ${encryptNum(r.price)},
        fees_enc = ${encryptNum(r.fees)},
        total_amount_enc = ${encryptNum(r.total_amount)},
        note_enc = ${encrypt(r.note)}
      WHERE id = ${r.id}
    `;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_transactions_v1')`;
}

interface TxRow extends TransactionEncFields {
  id: number;
  account_id: number;
  type: string;
  ticker: string;
  name: string;
  currency: string;
  date: string;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncHoldings(sql: any, tx: Transaction) {
  if (tx.type === "buy") {
    const existing = await sql`
      SELECT id, quantity, quantity_enc, avg_cost, avg_cost_enc FROM holdings
      WHERE account_id=${tx.account_id} AND ticker=${tx.ticker}`;
    if (existing.length > 0) {
      const h = existing[0];
      const curQty = h.quantity_enc ? (decryptNum(h.quantity_enc) ?? 0) : Number(h.quantity ?? 0);
      const curAvg = h.avg_cost_enc ? (decryptNum(h.avg_cost_enc) ?? 0) : Number(h.avg_cost ?? 0);
      const newQty = curQty + tx.quantity;
      const newAvg = newQty > 0 ? (curQty * curAvg + tx.quantity * tx.price) / newQty : 0;
      await sql`UPDATE holdings SET quantity_enc=${encryptNum(newQty)}, avg_cost_enc=${encryptNum(newAvg)} WHERE id=${h.id}`;
    } else {
      await sql`
        INSERT INTO holdings (account_id, ticker, name, currency, date, quantity_enc, avg_cost_enc, note_enc)
        VALUES (${tx.account_id}, ${tx.ticker}, ${tx.name}, ${tx.currency}, ${tx.date},
                ${encryptNum(tx.quantity)}, ${encryptNum(tx.price)}, ${encrypt("")})`;
    }
  } else if (tx.type === "sell") {
    const existing = await sql`
      SELECT id, quantity, quantity_enc FROM holdings
      WHERE account_id=${tx.account_id} AND ticker=${tx.ticker}`;
    if (existing.length > 0) {
      const h = existing[0];
      const curQty = h.quantity_enc ? (decryptNum(h.quantity_enc) ?? 0) : Number(h.quantity ?? 0);
      const newQty = curQty - tx.quantity;
      if (newQty <= 0.0001) {
        await sql`DELETE FROM holdings WHERE id=${h.id}`;
      } else {
        await sql`UPDATE holdings SET quantity_enc=${encryptNum(newQty)} WHERE id=${h.id}`;
      }
    }
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();
  await ensureSchema(sql);

  const rows = accountId
    ? await sql`
        SELECT t.* FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id=${accountId} AND a.user_id=${user.id}
        ORDER BY t.date DESC, t.id DESC` as TxRow[]
    : await sql`
        SELECT t.* FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id=${user.id}
        ORDER BY t.date DESC, t.id DESC` as TxRow[];

  return NextResponse.json(rows.map(decryptTransactionFields));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { account_id, type, ticker, name, quantity, price, fees, currency, date, note } = body;

  if (!account_id || !type || !date)
    return NextResponse.json({ error: "account_id, type, date required" }, { status: 400 });

  const sql = getDb();
  await ensureSchema(sql);
  const owns = await sql`SELECT id FROM accounts WHERE id=${account_id} AND user_id=${user.id}`;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const qtyN = Number(quantity ?? 0);
  const priceN = Number(price ?? 0);
  const feesN = Number(fees ?? 0);
  const totalAmount = qtyN * priceN + feesN;

  const [tx] = await sql`
    INSERT INTO transactions (
      account_id, type, ticker, name, currency, date,
      quantity_enc, price_enc, fees_enc, total_amount_enc, note_enc
    )
    VALUES (
      ${account_id}, ${type}, ${ticker ?? ""}, ${name ?? ""}, ${currency ?? "KRW"}, ${date},
      ${encryptNum(qtyN)}, ${encryptNum(priceN)}, ${encryptNum(feesN)}, ${encryptNum(totalAmount)},
      ${encrypt(note ?? "")}
    )
    RETURNING *
  ` as TxRow[];

  const decrypted = decryptTransactionFields(tx);
  await syncHoldings(sql, { ...decrypted, type, ticker: ticker ?? "", name: name ?? "", currency: currency ?? "KRW", account_id, date } as Transaction);
  return NextResponse.json(decrypted, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const owns = await sql`
    SELECT t.id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [tx] = await sql`
    UPDATE transactions SET date=${date}, note_enc=${encrypt(note ?? "")}
    WHERE id=${id} RETURNING *
  ` as TxRow[];
  return NextResponse.json(decryptTransactionFields(tx));
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT t.id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE t.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM transactions WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
