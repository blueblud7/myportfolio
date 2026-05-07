import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEarningsCalendarEvents } from "@/lib/yahoo-finance";
import { getSessionUser } from "@/lib/auth";

export const maxDuration = 60;

// 한국 종목 실적발표 추정일: 12월 결산 기준 공시 법정 기한
// Q1(11013) → 5월 15일, 반기(11012) → 8월 14일, Q3(11014) → 11월 14일, 연간(11011) → 3월 31일
function estimateKoreanEarningsDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12

  let target: Date;
  if (m <= 3)       target = new Date(y, 2, 31);   // 3/31 연간
  else if (m <= 5)  target = new Date(y, 4, 15);   // 5/15 Q1
  else if (m <= 8)  target = new Date(y, 7, 14);   // 8/14 반기
  else if (m <= 11) target = new Date(y, 10, 14);  // 11/14 Q3
  else              target = new Date(y + 1, 2, 31); // 내년 3/31

  return target.toISOString().split("T")[0];
}

export interface EarningsCalendarItem {
  ticker: string;
  name: string;
  earnings_date: string | null;
  eps_estimate: number | null;
  updated_at: string;
  source: "holding" | "watchlist" | "both";
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const rows = await sql`
    WITH sources AS (
      SELECT DISTINCT h.ticker, h.name, 'holding'::text AS src
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker <> 'CASH' AND a.user_id = ${user.id}
      UNION
      SELECT DISTINCT ticker, name, 'watchlist'::text AS src FROM watchlist WHERE user_id = ${user.id}
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
      const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);

      let earningsDate: string | null = null;
      let epsEstimate: number | null = null;

      if (isKorean) {
        // 한국: Yahoo calendarEvents 시도 후 추정일 fallback
        const events = await getEarningsCalendarEvents(ticker);
        earningsDate = events?.earningsDate ?? estimateKoreanEarningsDate();
        epsEstimate = events?.epsEstimate ?? null;
      } else {
        const events = await getEarningsCalendarEvents(ticker);
        if (!events?.earningsDate) {
          failed.push(ticker);
          return;
        }
        earningsDate = events.earningsDate;
        epsEstimate = events.epsEstimate;
      }

      await sql`
        INSERT INTO earnings_calendar (ticker, name, earnings_date, eps_estimate, updated_at)
        VALUES (${ticker}, ${name}, ${earningsDate}, ${epsEstimate},
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
