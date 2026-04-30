import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt, encryptNum, decryptNum, tryDecrypt } from "@/lib/crypto";
import { decryptJoinedAccountName } from "@/lib/account-crypto";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS balance_enc TEXT`;
  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS note_enc TEXT`;
  await sql`ALTER TABLE bank_balances ALTER COLUMN balance DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE bank_balances ALTER COLUMN note DROP NOT NULL`.catch(() => {});

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_bank_balances_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`SELECT id, balance, note FROM bank_balances WHERE balance_enc IS NULL` as {
    id: number; balance: number | null; note: string | null;
  }[];
  for (const r of rows) {
    await sql`
      UPDATE bank_balances SET
        balance_enc = ${encryptNum(r.balance)},
        note_enc = ${encrypt(r.note)}
      WHERE id = ${r.id}
    `;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_bank_balances_v1')`;
}

interface BankBalanceRow {
  id: number;
  account_id: number;
  balance: number | null;
  balance_enc: string | null;
  date: string;
  note: string | null;
  note_enc: string | null;
  account_name?: string | null;
  account_name_enc?: string | null;
  currency?: string;
}

function decryptRow(r: BankBalanceRow) {
  return {
    ...r,
    balance: r.balance_enc !== null ? decryptNum(r.balance_enc) ?? 0 : (r.balance ?? 0),
    note: r.note_enc !== null ? tryDecrypt(r.note_enc) : r.note,
    account_name: r.account_name !== undefined || r.account_name_enc !== undefined
      ? decryptJoinedAccountName(r) : undefined,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = new URL(req.url).searchParams.get("account_id");
  const sql = getDb();
  await ensureSchema(sql);

  if (accountId) {
    const rows = await sql`
      SELECT bb.* FROM bank_balances bb
      JOIN accounts a ON bb.account_id = a.id
      WHERE bb.account_id=${accountId} AND a.user_id=${user.id}
      ORDER BY bb.date DESC
    ` as BankBalanceRow[];
    return NextResponse.json(rows.map(decryptRow));
  }
  const rows = await sql`
    SELECT bb.*, a.name as account_name, a.name_enc as account_name_enc, a.currency
    FROM bank_balances bb JOIN accounts a ON bb.account_id=a.id
    WHERE a.user_id=${user.id}
    ORDER BY bb.date DESC
  ` as BankBalanceRow[];
  return NextResponse.json(rows.map(decryptRow));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account_id, balance, date, note } = await req.json();
  if (!account_id || balance === undefined || !date)
    return NextResponse.json({ error: "account_id, balance, date required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const owns = await sql`SELECT id FROM accounts WHERE id=${account_id} AND user_id=${user.id}`;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await sql`
    INSERT INTO bank_balances (account_id, balance_enc, date, note_enc)
    VALUES (${account_id}, ${encryptNum(Number(balance))}, ${date}, ${encrypt(note ?? "")})
    RETURNING *
  ` as BankBalanceRow[];
  return NextResponse.json(decryptRow(row), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, balance, date, note } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const owns = await sql`
    SELECT bb.id FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await sql`
    UPDATE bank_balances
    SET balance_enc=${encryptNum(Number(balance))}, date=${date}, note_enc=${encrypt(note ?? "")}
    WHERE id=${id} RETURNING *
  ` as BankBalanceRow[];
  return NextResponse.json(decryptRow(row));
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const owns = await sql`
    SELECT bb.id FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE bb.id=${id} AND a.user_id=${user.id}
  `;
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM bank_balances WHERE id=${id}`;
  return NextResponse.json({ success: true });
}
