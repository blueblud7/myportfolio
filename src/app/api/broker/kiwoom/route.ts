import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { getKiwoomToken, getKiwoomHoldings } from "@/lib/kiwoom";

/** GET /api/broker/kiwoom?account_id=X - 저장된 credentials 조회 (마스킹) */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT id, account_id, broker, account_number, last_synced_at FROM broker_credentials WHERE account_id = ?")
    .get(Number(accountId));

  if (!row) {
    return NextResponse.json(null);
  }

  return NextResponse.json(row);
}

/** POST /api/broker/kiwoom - credentials 저장 또는 업데이트 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { account_id, app_key, secret_key, account_number } = body;

  if (!account_id || !app_key || !secret_key || !account_number) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO broker_credentials (account_id, broker, app_key, secret_key, account_number)
    VALUES (?, 'kiwoom', ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      app_key = excluded.app_key,
      secret_key = excluded.secret_key,
      account_number = excluded.account_number
  `).run(account_id, app_key, secret_key, account_number);

  return NextResponse.json({ ok: true });
}

/** DELETE /api/broker/kiwoom?account_id=X - credentials 삭제 */
export async function DELETE(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM broker_credentials WHERE account_id = ?").run(Number(accountId));
  return NextResponse.json({ ok: true });
}

/** PATCH /api/broker/kiwoom - 보유종목 동기화 실행 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { account_id } = body;

  if (!account_id) {
    return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  }

  const db = getDb();
  const creds = db
    .prepare("SELECT * FROM broker_credentials WHERE account_id = ?")
    .get(Number(account_id)) as { app_key: string; secret_key: string; account_number: string } | undefined;

  if (!creds) {
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 404 });
  }

  try {
    // 1. 토큰 발급
    const token = await getKiwoomToken(creds.app_key, creds.secret_key);

    // 2. 보유종목 조회
    const rawHoldings = await getKiwoomHoldings(token.access_token, creds.account_number);

    // 3. DB에 upsert (기존 종목 업데이트, 새 종목 추가)
    const upsert = db.prepare(`
      INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency)
      VALUES (?, ?, ?, ?, ?, 'KRW')
      ON CONFLICT(account_id, ticker) DO UPDATE SET
        quantity = excluded.quantity,
        avg_cost = excluded.avg_cost
    `);

    // holdings 테이블에 (account_id, ticker) unique constraint가 없으면 아래 방식 사용
    const getExisting = db.prepare("SELECT id FROM holdings WHERE account_id = ? AND ticker = ?");
    const updateHolding = db.prepare("UPDATE holdings SET quantity = ?, avg_cost = ? WHERE account_id = ? AND ticker = ?");
    const insertHolding = db.prepare("INSERT INTO holdings (account_id, ticker, name, quantity, avg_cost, currency) VALUES (?, ?, ?, ?, ?, 'KRW')");

    let added = 0;
    let updated = 0;

    for (const h of rawHoldings) {
      const existing = getExisting.get(account_id, h.ticker);
      if (existing) {
        updateHolding.run(h.quantity, h.avg_cost, account_id, h.ticker);
        updated++;
      } else {
        try {
          upsert.run(account_id, h.ticker, h.name, h.quantity, h.avg_cost);
          added++;
        } catch {
          insertHolding.run(account_id, h.ticker, h.name, h.quantity, h.avg_cost);
          added++;
        }
      }
    }

    // 4. last_synced_at 업데이트
    db.prepare("UPDATE broker_credentials SET last_synced_at = datetime('now') WHERE account_id = ?")
      .run(account_id);

    return NextResponse.json({
      ok: true,
      added,
      updated,
      total: rawHoldings.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
