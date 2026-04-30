import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { decryptAccountName } from "@/lib/account-crypto";

async function ensureSchema(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  await sql`UPDATE accounts SET sort_order = id WHERE sort_order IS NULL`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner TEXT`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE accounts SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;

  // 암호화 컬럼
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name_enc TEXT`;
  await sql`ALTER TABLE accounts ALTER COLUMN name DROP NOT NULL`.catch(() => {});

  // 일회성 마이그레이션
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_accounts_v1'` as { name: string }[];
  if (done) return;

  const rows = await sql`SELECT id, name FROM accounts WHERE name_enc IS NULL` as {
    id: number; name: string | null;
  }[];
  for (const r of rows) {
    await sql`UPDATE accounts SET name_enc = ${encrypt(r.name)} WHERE id = ${r.id}`;
  }
  await sql`INSERT INTO _migrations (name) VALUES ('encrypt_accounts_v1')`;
}

interface AccountRow {
  id: number;
  name: string | null;
  name_enc: string | null;
  type: string;
  currency: string;
  broker: string | null;
  target_pct: number;
  owner: string | null;
  user_id: number;
  sort_order: number;
  [key: string]: unknown;
}

function decryptRow(r: AccountRow) {
  return { ...r, name: decryptAccountName(r) };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getDb();
  await ensureSchema(sql);
  const accounts = await sql`SELECT * FROM accounts WHERE user_id = ${user.id} ORDER BY sort_order ASC, id ASC` as AccountRow[];
  return NextResponse.json(accounts.map(decryptRow));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, type, currency, broker, owner } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const [account] = await sql`
    INSERT INTO accounts (name_enc, type, currency, broker, target_pct, owner, user_id)
    VALUES (${encrypt(name)}, ${type}, ${currency ?? "KRW"}, ${broker ?? ""}, 0, ${owner ?? null}, ${user.id})
    RETURNING *
  ` as AccountRow[];
  return NextResponse.json(decryptRow(account), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, name, type, currency, broker, target_pct, owner } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await ensureSchema(sql);
  const [account] = await sql`
    UPDATE accounts SET name_enc=${encrypt(name)}, type=${type}, currency=${currency}, broker=${broker},
      target_pct=${target_pct ?? 0}, owner=${owner ?? null}
    WHERE id=${id} AND user_id=${user.id} RETURNING *
  ` as AccountRow[];
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(decryptRow(account));
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items: { id: number; sort_order: number }[] = await req.json();
  const sql = getDb();
  await Promise.all(
    items.map(({ id, sort_order }) =>
      sql`UPDATE accounts SET sort_order = ${sort_order} WHERE id = ${id} AND user_id = ${user.id}`
    )
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM accounts WHERE id=${id} AND user_id=${user.id}`;
  return NextResponse.json({ success: true });
}
