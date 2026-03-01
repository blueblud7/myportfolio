import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();
  const alerts = await sql`SELECT * FROM price_alerts ORDER BY created_at DESC`;

  // Enrich with current prices
  const tickers = [...new Set(alerts.map((a) => a.ticker as string))];
  let prices: Record<string, number> = {};

  if (tickers.length > 0) {
    const priceRows = await sql`
      SELECT DISTINCT ON (ticker) ticker, price
      FROM price_history
      WHERE ticker = ANY(${tickers})
      ORDER BY ticker, date DESC
    `;
    prices = Object.fromEntries(priceRows.map((p) => [p.ticker, Number(p.price)]));
  }

  const enriched = alerts.map((a) => {
    const cp = prices[a.ticker] ?? null;
    return {
      ...a,
      current_price: cp,
      is_triggered:
        cp !== null &&
        ((a.alert_type === "above" && cp >= Number(a.target_price)) ||
          (a.alert_type === "below" && cp <= Number(a.target_price))),
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const { ticker, name, target_price, alert_type, currency, note } = await req.json();
  if (!ticker || !target_price || !alert_type) {
    return NextResponse.json(
      { error: "ticker, target_price, alert_type required" },
      { status: 400 }
    );
  }
  const sql = getDb();
  const [alert] = await sql`
    INSERT INTO price_alerts (ticker, name, target_price, alert_type, currency, note)
    VALUES (${ticker}, ${name ?? ""}, ${Number(target_price)}, ${alert_type}, ${currency ?? "USD"}, ${note ?? ""})
    RETURNING *
  `;
  return NextResponse.json(alert, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, target_price, alert_type, note, is_active } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [alert] = await sql`
    UPDATE price_alerts
    SET target_price = ${Number(target_price)},
        alert_type = ${alert_type},
        note = ${note ?? ""},
        is_active = ${is_active ?? true}
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json(alert);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  await sql`DELETE FROM price_alerts WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
