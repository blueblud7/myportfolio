import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEarningsCalendarEvents } from "@/lib/yahoo-finance";

export const maxDuration = 60;

export interface EarningsCalendarItem {
  ticker: string;
  name: string;
  earnings_date: string | null;
  eps_estimate: number | null;
  updated_at: string;
  source: "holding" | "watchlist" | "both";
}

export async function GET() {
  const sql = getDb();
  const rows = await sql`
    WITH sources AS (
      SELECT DISTINCT ticker, name, 'holding'::text AS src FROM holdings WHERE ticker <> 'CASH'
      UNION
      SELECT DISTINCT ticker, name, 'watchlist'::text AS src FROM watchlist
    ),
    grouped AS (
      SELECT
        ticker,
        MAX(name) AS name,
        STRING_AGG(DISTINCT src, ',') AS srcs
      FROM sources
      GROUP BY ticker
    )
    SELECT
      g.ticker,
      g.name,
      e.earnings_date,
      e.eps_estimate,
      e.updated_at,
      CASE
        WHEN g.srcs LIKE '%holding%' AND g.srcs LIKE '%watchlist%' THEN 'both'
        WHEN g.srcs LIKE '%holding%' THEN 'holding'
        ELSE 'watchlist'
      END AS source
    FROM grouped g
    LEFT JOIN earnings_calendar e ON g.ticker = e.ticker
    ORDER BY
      CASE WHEN e.earnings_date IS NULL THEN 1 ELSE 0 END,
      e.earnings_date ASC,
      g.ticker
  `;
  return NextResponse.json(rows);
}

export async function POST() {
  const sql = getDb();
  const tickers = await sql`
    SELECT DISTINCT ticker, name FROM (
      SELECT ticker, name FROM holdings WHERE ticker <> 'CASH'
      UNION
      SELECT ticker, name FROM watchlist
    ) AS t
  ` as { ticker: string; name: string }[];

  let updated = 0;
  const failed: string[] = [];

  await Promise.all(
    tickers.map(async ({ ticker, name }) => {
      const events = await getEarningsCalendarEvents(ticker);
      if (!events || !events.earningsDate) {
        failed.push(ticker);
        return;
      }
      await sql`
        INSERT INTO earnings_calendar (ticker, name, earnings_date, eps_estimate, updated_at)
        VALUES (${ticker}, ${name}, ${events.earningsDate}, ${events.epsEstimate},
                ${new Date().toISOString().replace("T", " ").slice(0, 19)})
        ON CONFLICT (ticker) DO UPDATE SET
          name = EXCLUDED.name,
          earnings_date = EXCLUDED.earnings_date,
          eps_estimate = EXCLUDED.eps_estimate,
          updated_at = EXCLUDED.updated_at
      `;
      updated++;
    })
  );

  return NextResponse.json({ updated, failed, total: tickers.length });
}
