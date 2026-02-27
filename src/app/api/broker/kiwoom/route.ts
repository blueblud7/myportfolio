import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getKiwoomToken, getKiwoomHoldings } from "@/lib/kiwoom";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  const sql = getDb();
  const rows = await sql`SELECT id, account_id, broker, account_number, last_synced_at FROM broker_credentials WHERE account_id=${Number(accountId)}`;
  return NextResponse.json(rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const { account_id, app_key, secret_key, account_number } = await req.json();
  if (!account_id || !app_key || !secret_key || !account_number)
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  const sql = getDb();
  await sql`
    INSERT INTO broker_credentials (account_id, broker, app_key, secret_key, account_number)
    VALUES (${account_id}, 'kiwoom', ${app_key}, ${secret_key}, ${account_number})
    ON CONFLICT (account_id) DO UPDATE SET app_key=${app_key}, secret_key=${secret_key}, account_number=${account_number}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM broker_credentials WHERE account_id=${Number(accountId)}`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  const sql = getDb();
  const rows = await sql`SELECT * FROM broker_credentials WHERE account_id=${Number(account_id)}`;
  const creds = rows[0] as { app_key: string; secret_key: string; account_number: string } | undefined;
  if (!creds) return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 404 });
  try {
    const token = await getKiwoomToken(creds.app_key, creds.secret_key);
    const rawHoldings = await getKiwoomHoldings(token.access_token, creds.account_number);
    let added = 0, updated = 0;
    for (const h of rawHoldings) {
      const ex = await sql`SELECT id FROM holdings WHERE account_id=${account_id} AND ticker=${h.ticker}`;
      if (ex.length > 0) {
        await sql`UPDATE holdings SET quantity=${h.quantity}, avg_cost=${h.avg_cost} WHERE account_id=${account_id} AND ticker=${h.ticker}`;
        updated++;
      } else {
        await sql`INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency) VALUES (${account_id}, ${h.ticker}, ${h.name}, ${h.quantity}, ${h.avg_cost}, 'KRW')`;
        added++;
      }
    }
    await sql`UPDATE broker_credentials SET last_synced_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE account_id=${account_id}`;
    return NextResponse.json({ ok: true, added, updated, total: rawHoldings.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "오류" }, { status: 500 });
  }
}
