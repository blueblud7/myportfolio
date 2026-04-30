import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEarningsHistory, type EarningsQuarter } from "@/lib/yahoo-finance";
import { getFinnhubEarnings } from "@/lib/finnhub";
import { getSessionUser } from "@/lib/auth";

export const maxDuration = 60;

export interface EarningsResultRow {
  ticker: string;
  name: string;
  quarter: string;
  reported_date: string | null;
  eps_actual: number | null;
  eps_estimate: number | null;
  surprise_pct: number | null;
  updated_at: string;
}

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS earnings_results (
      ticker TEXT NOT NULL,
      quarter TEXT NOT NULL,
      reported_date DATE,
      eps_actual DOUBLE PRECISION,
      eps_estimate DOUBLE PRECISION,
      surprise_pct DOUBLE PRECISION,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (ticker, quarter)
    )
  `;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);

  const rows = await sql`
    WITH user_tickers AS (
      SELECT DISTINCT h.ticker, h.name
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker <> 'CASH' AND a.user_id = ${user.id}
      UNION
      SELECT DISTINCT ticker, name FROM watchlist WHERE user_id = ${user.id}
    )
    SELECT
      u.ticker,
      u.name,
      r.quarter,
      r.reported_date,
      r.eps_actual,
      r.eps_estimate,
      r.surprise_pct,
      r.updated_at
    FROM user_tickers u
    LEFT JOIN earnings_results r ON r.ticker = u.ticker
    ORDER BY u.ticker, r.reported_date DESC NULLS LAST
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);

  const tickers = await sql`
    SELECT DISTINCT ticker, MAX(name) AS name FROM (
      SELECT h.ticker, h.name
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker <> 'CASH' AND a.user_id = ${user.id}
      UNION
      SELECT ticker, name FROM watchlist WHERE user_id = ${user.id}
    ) AS t
    GROUP BY ticker
  ` as { ticker: string; name: string }[];

  let updated = 0;
  let totalQuarters = 0;
  const failed: string[] = [];
  const sources: { yahoo: number; finnhub: number } = { yahoo: 0, finnhub: 0 };

  await Promise.allSettled(
    tickers.map(async ({ ticker }) => {
      try {
        let history: EarningsQuarter[] | null = await getEarningsHistory(ticker);
        let source: "yahoo" | "finnhub" | null = history && history.length > 0 ? "yahoo" : null;

        // Fallback: Finnhub (Yahoo가 빈 응답 주는 종목용)
        if (!source) {
          const finn = await getFinnhubEarnings(ticker);
          if (finn && finn.length > 0) {
            history = finn.map((f): EarningsQuarter => ({
              quarter: `${f.quarter}Q${f.year}`,
              date: f.period ?? null,
              epsActual: f.actual,
              epsEstimate: f.estimate,
              surprisePct: f.surprisePercent,
            }));
            source = "finnhub";
          }
        }

        if (!history || history.length === 0 || !source) {
          failed.push(ticker);
          return;
        }
        sources[source]++;
        let inserted = 0;
        for (const q of history) {
          if (!q.quarter) continue;
          await sql`
            INSERT INTO earnings_results (ticker, quarter, reported_date, eps_actual, eps_estimate, surprise_pct, updated_at)
            VALUES (${ticker}, ${q.quarter}, ${q.date}, ${q.epsActual}, ${q.epsEstimate}, ${q.surprisePct}, NOW())
            ON CONFLICT (ticker, quarter) DO UPDATE SET
              reported_date = EXCLUDED.reported_date,
              eps_actual = EXCLUDED.eps_actual,
              eps_estimate = EXCLUDED.eps_estimate,
              surprise_pct = EXCLUDED.surprise_pct,
              updated_at = EXCLUDED.updated_at
          `;
          inserted++;
        }
        if (inserted > 0) {
          updated++;
          totalQuarters += inserted;
        } else {
          failed.push(ticker);
        }
      } catch {
        failed.push(ticker);
      }
    })
  );

  return NextResponse.json({ updated, failed, total: tickers.length, totalQuarters, sources });
}
