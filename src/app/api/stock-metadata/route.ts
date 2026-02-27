import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStockMetadataFromYahoo } from "@/lib/yahoo-finance";

export async function POST() {
  const sql = getDb();
  const rows = await sql`SELECT DISTINCT ticker FROM holdings WHERE ticker != 'CASH'` as { ticker: string }[];
  let success = 0, failed = 0;
  for (const { ticker } of rows) {
    const meta = await getStockMetadataFromYahoo(ticker);
    if (meta) {
      await sql`
        INSERT INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
        VALUES (${ticker}, ${meta.sector}, ${meta.annual_dividend}, ${meta.dividend_yield}, to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
        ON CONFLICT (ticker) DO UPDATE SET sector=${meta.sector}, annual_dividend=${meta.annual_dividend},
          dividend_yield=${meta.dividend_yield}, updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
      `;
      success++;
    } else {
      await sql`
        INSERT INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
        VALUES (${ticker}, '', 0, 0, to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
        ON CONFLICT (ticker) DO NOTHING
      `;
      failed++;
    }
  }
  return NextResponse.json({ total: rows.length, success, failed });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const sql = getDb();
  const existing = (await sql`SELECT * FROM stock_metadata WHERE ticker=${ticker}`)[0] as
    { ticker: string; sector: string; annual_dividend: number; dividend_yield: number; updated_at: string | null } | undefined;
  const isStale = !existing?.updated_at || Date.now() - new Date(existing.updated_at).getTime() > SEVEN_DAYS_MS;
  if (isStale) {
    const yahoo = await getStockMetadataFromYahoo(ticker);
    if (yahoo) {
      await sql`
        INSERT INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
        VALUES (${ticker}, ${yahoo.sector}, ${yahoo.annual_dividend}, ${yahoo.dividend_yield}, to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
        ON CONFLICT (ticker) DO UPDATE SET sector=${yahoo.sector}, annual_dividend=${yahoo.annual_dividend},
          dividend_yield=${yahoo.dividend_yield}, updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
      `;
      return NextResponse.json({ ticker, sector: yahoo.sector, annual_dividend: yahoo.annual_dividend, dividend_yield: yahoo.dividend_yield });
    }
  }
  if (existing) return NextResponse.json({ ticker: existing.ticker, sector: existing.sector, annual_dividend: existing.annual_dividend, dividend_yield: existing.dividend_yield });
  return NextResponse.json({ ticker, sector: "", annual_dividend: 0, dividend_yield: 0 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as { ticker: string; sector?: string; annual_dividend?: number };
  if (!body.ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const sql = getDb();
  const existing = (await sql`SELECT * FROM stock_metadata WHERE ticker=${body.ticker}`)[0] as
    { sector: string; annual_dividend: number; dividend_yield: number } | undefined;
  await sql`
    INSERT INTO stock_metadata (ticker, sector, annual_dividend, dividend_yield, updated_at)
    VALUES (${body.ticker}, ${body.sector ?? existing?.sector ?? ""}, ${body.annual_dividend ?? existing?.annual_dividend ?? 0},
            ${existing?.dividend_yield ?? 0}, to_char(NOW(),'YYYY-MM-DD HH24:MI:SS'))
    ON CONFLICT (ticker) DO UPDATE SET sector=${body.sector ?? existing?.sector ?? ""},
      annual_dividend=${body.annual_dividend ?? existing?.annual_dividend ?? 0},
      updated_at=to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')
  `;
  return NextResponse.json({ ok: true });
}
