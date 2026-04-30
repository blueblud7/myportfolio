import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS earnings_insights_cache (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      content TEXT NOT NULL,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);

  const [cached] = await sql`
    SELECT content, generated_at FROM earnings_insights_cache
    WHERE user_id = ${user.id}
  ` as { content: string; generated_at: string }[];

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime();
    return NextResponse.json({
      content: cached.content,
      generated_at: cached.generated_at,
      stale: age > CACHE_TTL_MS,
    });
  }
  return NextResponse.json({ content: null, generated_at: null, stale: true });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);

  // 보유·관심 종목의 실적 캘린더(다가오는) + 최근 4분기 결과 수집
  const upcoming = await sql`
    WITH src AS (
      SELECT DISTINCT h.ticker, h.name
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker <> 'CASH' AND a.user_id = ${user.id}
      UNION
      SELECT DISTINCT ticker, name FROM watchlist WHERE user_id = ${user.id}
    )
    SELECT s.ticker, s.name, e.earnings_date, e.eps_estimate
    FROM src s
    LEFT JOIN earnings_calendar e ON e.ticker = s.ticker
    WHERE e.earnings_date IS NOT NULL AND e.earnings_date >= CURRENT_DATE
    ORDER BY e.earnings_date ASC
    LIMIT 30
  ` as { ticker: string; name: string; earnings_date: string; eps_estimate: number | null }[];

  const results = await sql`
    WITH src AS (
      SELECT DISTINCT h.ticker
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      WHERE h.ticker <> 'CASH' AND a.user_id = ${user.id}
      UNION
      SELECT DISTINCT ticker FROM watchlist WHERE user_id = ${user.id}
    ),
    ranked AS (
      SELECT r.ticker, r.quarter, r.reported_date, r.eps_actual, r.eps_estimate, r.surprise_pct,
             ROW_NUMBER() OVER (PARTITION BY r.ticker ORDER BY r.reported_date DESC NULLS LAST) AS rn
      FROM earnings_results r
      WHERE r.ticker IN (SELECT ticker FROM src)
    )
    SELECT ticker, quarter, reported_date, eps_actual, eps_estimate, surprise_pct
    FROM ranked WHERE rn <= 4
    ORDER BY ticker, reported_date DESC NULLS LAST
  ` as {
    ticker: string; quarter: string; reported_date: string | null;
    eps_actual: number | null; eps_estimate: number | null; surprise_pct: number | null;
  }[];

  if (upcoming.length === 0 && results.length === 0) {
    return NextResponse.json({ error: "분석할 실적 데이터가 없습니다. 먼저 일정/결과 갱신을 실행해주세요." }, { status: 400 });
  }

  const upcomingText = upcoming.length === 0 ? "(예정된 실적발표 없음)" :
    upcoming.map(u => `- ${u.ticker} (${u.name}): ${u.earnings_date}${u.eps_estimate !== null ? `, EPS 추정 $${u.eps_estimate.toFixed(2)}` : ""}`).join("\n");

  // ticker별로 그룹핑
  const byTicker = new Map<string, typeof results>();
  for (const r of results) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, []);
    byTicker.get(r.ticker)!.push(r);
  }
  const resultsText = Array.from(byTicker.entries()).map(([ticker, qs]) => {
    const lines = qs.map(q => {
      const a = q.eps_actual !== null ? `$${Number(q.eps_actual).toFixed(2)}` : "n/a";
      const e = q.eps_estimate !== null ? `$${Number(q.eps_estimate).toFixed(2)}` : "n/a";
      const s = q.surprise_pct !== null ? `${Number(q.surprise_pct) > 0 ? "+" : ""}${Number(q.surprise_pct).toFixed(1)}%` : "n/a";
      return `  · ${q.quarter}: actual ${a} / est ${e} / surprise ${s}`;
    }).join("\n");
    return `${ticker}:\n${lines}`;
  }).join("\n");

  const systemPrompt = `당신은 실적(Earnings) 분석 전문가입니다.
사용자의 보유·관심 종목들의 최근 4분기 실적 결과와 다가오는 발표 일정을 보고,
다음을 한국어 마크다운으로 간결하게 정리하세요:

1. **다가오는 핵심 일정** (3-5개, D-day 기준 가장 가까운 순) — 왜 주목해야 하는지 한줄 코멘트
2. **비트/미스 패턴** — 4분기 연속 비트 종목, 연속 미스 종목, 추세 반전 종목
3. **서프라이즈 강도 랭킹** — 최근 분기 surprise % 절댓값 상위 5개 (+/-)
4. **시사점** — 포트폴리오 관점 3가지 (예: "NVDA 4Q 비트 추세 → 추가 매수 검토 가치", "INTC 연속 미스 → 비중 축소 고려")

출력은 짧고 실용적으로. 데이터에 없는 추측은 하지 마세요.`;

  const userPrompt = `## 다가오는 실적 발표\n${upcomingText}\n\n## 최근 4분기 실적 결과\n${resultsText}`;

  const message = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = message.choices[0]?.message?.content ?? "";
  const finishReason = message.choices[0]?.finish_reason;
  if (!text || text.trim().length === 0) {
    return NextResponse.json({
      error: `AI가 빈 응답을 반환했습니다 (finish_reason: ${finishReason}). 다시 시도해주세요.`
    }, { status: 502 });
  }

  await sql`
    INSERT INTO earnings_insights_cache (user_id, content, generated_at)
    VALUES (${user.id}, ${text}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      content = EXCLUDED.content,
      generated_at = EXCLUDED.generated_at
  `;

  return NextResponse.json({ content: text, generated_at: new Date().toISOString(), stale: false });
}
