import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEarningsHistory, type EarningsQuarter } from "@/lib/yahoo-finance";
import { getFinnhubEarnings } from "@/lib/finnhub";
import { getSessionUser } from "@/lib/auth";
import dartCorpCodes from "@/lib/dart-corp-codes.json";

export const maxDuration = 60;

const DART_KEY = process.env.DART_API_KEY ?? "";

// 한국 종목: DART 사업보고서에서 연간 EPS 3개년 추출
async function getDartAnnualEPS(stockCode: string): Promise<EarningsQuarter[]> {
  if (!DART_KEY) return [];
  const corpCode = (dartCorpCodes as Record<string, string>)[stockCode];
  if (!corpCode) return [];

  const currentYear = new Date().getFullYear();

  for (const year of [currentYear - 1, currentYear - 2]) {
    for (const fsDiv of ["CFS", "OFS"]) {
      try {
        const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${DART_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011&fs_div=${fsDiv}`;
        const res = await fetch(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        if (data?.status !== "000" || !Array.isArray(data.list) || data.list.length === 0) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isItems = data.list.filter((i: any) => i.sj_div === "IS" || i.sj_div === "CIS");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const epsItem = isItems.find((i: any) =>
          i.account_id === "ifrs-full_BasicEarningsLossPerShare" ||
          i.account_nm?.includes("기본주당이익") ||
          i.account_nm?.includes("주당순이익")
        );
        if (!epsItem) continue;

        const parseAmt = (v: string): number | null => {
          const n = parseInt((v ?? "").replace(/,/g, ""), 10);
          return isNaN(n) ? null : n;
        };
        const makeYear = (dt: string | undefined, fallback: number) =>
          dt ? dt.slice(0, 4) : String(fallback);

        return [
          { quarter: `FY${makeYear(epsItem.thstrm_dt, year)}`,     date: null, epsActual: parseAmt(epsItem.thstrm_amount),    epsEstimate: null, surprisePct: null },
          { quarter: `FY${makeYear(epsItem.frmtrm_dt, year - 1)}`, date: null, epsActual: parseAmt(epsItem.frmtrm_amount),    epsEstimate: null, surprisePct: null },
          { quarter: `FY${makeYear(epsItem.bfefrmtrm_dt, year - 2)}`, date: null, epsActual: parseAmt(epsItem.bfefrmtrm_amount), epsEstimate: null, surprisePct: null },
        ].filter(q => q.epsActual != null);
      } catch { /* try next */ }
    }
  }
  return [];
}

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
  const sources: { yahoo: number; finnhub: number; dart: number } = { yahoo: 0, finnhub: 0, dart: 0 };

  await Promise.allSettled(
    tickers.map(async ({ ticker }) => {
      try {
        const isKorean = /^\d[A-Z0-9]{5}$/i.test(ticker);
        let history: EarningsQuarter[] | null = null;
        let source: "yahoo" | "finnhub" | "dart" | null = null;

        if (isKorean) {
          // 한국 종목: DART 연간 EPS
          const dartHistory = await getDartAnnualEPS(ticker);
          if (dartHistory.length > 0) { history = dartHistory; source = "dart"; }
        } else {
          // 해외 종목: Yahoo (yahoo-finance2 npm → raw fetch → Finnhub)
          history = await getEarningsHistory(ticker);
          if (history && history.length > 0) {
            source = "yahoo";
          } else {
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
