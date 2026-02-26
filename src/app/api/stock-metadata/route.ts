import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStockMetadataFromYahoo } from "@/lib/yahoo-finance";

/** POST - 보유 종목 전체 메타데이터 일괄 조회 */
export async function POST() {
  const db = getDb();

  const rows = db
    .prepare(`SELECT DISTINCT ticker FROM holdings WHERE ticker != 'CASH'`)
    .all() as { ticker: string }[];

  const tickers = rows.map((r) => r.ticker);
  let success = 0;
  let failed = 0;

  for (const ticker of tickers) {
    const meta = await getStockMetadataFromYahoo(ticker);
    if (meta) {
      db.prepare(
        `INSERT OR REPLACE INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(ticker, meta.sector, meta.annual_dividend, meta.dividend_yield);
      success++;
    } else {
      // Yahoo에서 못 가져온 경우 빈 레코드라도 upsert (기타 → 수동 입력 유도)
      db.prepare(
        `INSERT OR IGNORE INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
         VALUES (?, '', 0, 0, datetime('now'))`
      ).run(ticker);
      failed++;
    }
  }

  return NextResponse.json({ total: tickers.length, success, failed });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .prepare(`SELECT * FROM stock_metadata WHERE ticker = ?`)
    .get(ticker) as {
    ticker: string;
    sector: string;
    annual_dividend: number;
    dividend_yield: number;
    updated_at: string | null;
  } | undefined;

  const isStale =
    !existing ||
    !existing.updated_at ||
    Date.now() - new Date(existing.updated_at).getTime() > SEVEN_DAYS_MS;

  if (isStale) {
    const yahoo = await getStockMetadataFromYahoo(ticker);
    if (yahoo) {
      db.prepare(
        `INSERT OR REPLACE INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(ticker, yahoo.sector, yahoo.annual_dividend, yahoo.dividend_yield);

      return NextResponse.json({
        ticker,
        sector: yahoo.sector,
        annual_dividend: yahoo.annual_dividend,
        dividend_yield: yahoo.dividend_yield,
      });
    }
  }

  if (existing) {
    return NextResponse.json({
      ticker: existing.ticker,
      sector: existing.sector,
      annual_dividend: existing.annual_dividend,
      dividend_yield: existing.dividend_yield,
    });
  }

  return NextResponse.json({
    ticker,
    sector: "",
    annual_dividend: 0,
    dividend_yield: 0,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as {
    ticker: string;
    sector?: string;
    annual_dividend?: number;
  };

  if (!body.ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const db = getDb();

  const existing = db
    .prepare(`SELECT * FROM stock_metadata WHERE ticker = ?`)
    .get(body.ticker) as {
    ticker: string;
    sector: string;
    annual_dividend: number;
    dividend_yield: number;
  } | undefined;

  db.prepare(
    `INSERT OR REPLACE INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(
    body.ticker,
    body.sector ?? existing?.sector ?? "",
    body.annual_dividend ?? existing?.annual_dividend ?? 0,
    existing?.dividend_yield ?? 0
  );

  return NextResponse.json({ ok: true });
}
