import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt, encryptNum, decryptNum } from "@/lib/crypto";
import { decryptTransactionFields, type TransactionEncFields } from "@/lib/transactions-crypto";
import { getExchangeRateForDate } from "@/lib/exchange-rate";
import type { Transaction } from "@/types";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS quantity_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fees_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_amount_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note_enc TEXT`;
  // 거래 시점 환율(KRW/통화) + 실현손익(매도) 컬럼
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_pnl_enc TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS avg_cost_at_sale_enc TEXT`;
  await sql`ALTER TABLE transactions ALTER COLUMN quantity DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN price DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN fees DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN total_amount DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE transactions ALTER COLUMN note DROP NOT NULL`.catch(() => {});

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;

  // 거래 시점 환율 백필: KRW 거래는 1, USD 거래는 거래일 기준 환율로 채움
  const [fxDone] = await sql`SELECT name FROM _migrations WHERE name = 'backfill_tx_fx_rate_v1'` as { name: string }[];
  if (!fxDone) {
    const fxRows = await sql`SELECT id, currency, date FROM transactions WHERE fx_rate IS NULL` as { id: number; currency: string; date: string }[];
    for (const r of fxRows) {
      const fx = r.currency === "USD" ? await getExchangeRateForDate(r.date) : 1;
      await sql`UPDATE transactions SET fx_rate = ${fx} WHERE id = ${r.id}`;
    }
    await sql`INSERT INTO _migrations (name) VALUES ('backfill_tx_fx_rate_v1') ON CONFLICT DO NOTHING`;
  }

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
  const txCurrency = currency ?? "KRW";

  // 거래 시점 환율 (KRW 거래는 1, USD 거래는 거래일 기준)
  const fxRate = txCurrency === "USD" ? await getExchangeRateForDate(date) : 1;

  // 매도라면 보유 평균단가 기준 실현손익을 계산해 함께 저장
  let realizedEnc: string | null = null;
  let avgCostAtSaleEnc: string | null = null;
  if (type === "sell" && ticker) {
    const cur = await sql`
      SELECT avg_cost, avg_cost_enc FROM holdings
      WHERE account_id=${account_id} AND ticker=${ticker} LIMIT 1`;
    if (cur.length > 0) {
      const h = cur[0];
      const avgCost = h.avg_cost_enc ? (decryptNum(h.avg_cost_enc) ?? 0) : Number(h.avg_cost ?? 0);
      const realized = (priceN - avgCost) * qtyN - feesN;
      realizedEnc = encryptNum(realized);
      avgCostAtSaleEnc = encryptNum(avgCost);
    }
  }

  const [tx] = await sql`
    INSERT INTO transactions (
      account_id, type, ticker, name, currency, date,
      quantity_enc, price_enc, fees_enc, total_amount_enc, note_enc,
      fx_rate, realized_pnl_enc, avg_cost_at_sale_enc
    )
    VALUES (
      ${account_id}, ${type}, ${ticker ?? ""}, ${name ?? ""}, ${txCurrency}, ${date},
      ${encryptNum(qtyN)}, ${encryptNum(priceN)}, ${encryptNum(feesN)}, ${encryptNum(totalAmount)},
      ${encrypt(note ?? "")},
      ${fxRate}, ${realizedEnc}, ${avgCostAtSaleEnc}
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
