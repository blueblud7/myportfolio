import OpenAI from "openai";
import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { decryptHoldingFields } from "./holdings-crypto";
import { encrypt, decrypt } from "./crypto";
import { DEFAULT_AI_PARAMS_JSON } from "./ai-config";
import { getStockNews, getAnalystSnapshot, type NewsItem, type AnalystSnapshot } from "./news";
import { todayKST } from "./tz";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type DigestPeriod = "daily" | "weekly" | "monthly";

export const PERIOD_DAYS: Record<DigestPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };
const PERIOD_LABEL: Record<DigestPeriod, string> = { daily: "데일리", weekly: "위클리", monthly: "먼슬리" };
// AI 비용·시간 통제: 비중 상위 N개 종목만 심층 수집
const MAX_TICKERS = 15;

export interface FocusPoint {
  ticker: string;
  name: string;
  rating: string | null;
  targetPrice: number | null;
  thesis: string;       // AI 한 줄 요지
  changeNote: string;   // 전 기간 대비 변화 (없으면 "")
}

export interface DigestRecord {
  id: number;
  period: DigestPeriod;
  date: string;
  content: string;
  focus: FocusPoint[];
  created_at: string;
  truncated?: number;   // 수집에서 제외된 종목 수
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

export async function ensureDigestTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS digests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      date TEXT NOT NULL,
      content_enc TEXT,
      focus JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, period, date)
    )
  `.catch(() => {});
}

export interface Holding {
  ticker: string; name: string; currency: string;
  quantity: number; avg_cost: number; current_price: number;
  valueKrw: number; pct: number; gainLossPct: number;
}

export async function getUserHoldings(sql: Sql, userId: number, exchangeRate: number): Promise<Holding[]> {
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});

  const rows = await sql`
    SELECT h.ticker, h.name, h.currency,
           h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           h.manual_price, h.manual_price_enc,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE a.user_id = ${userId} AND a.type = 'stock' AND h.ticker != 'CASH'
    ORDER BY h.ticker
  ` as {
    ticker: string; name: string; currency: string;
    quantity: number | null; quantity_enc: string | null;
    avg_cost: number | null; avg_cost_enc: string | null;
    manual_price: number | null; manual_price_enc: string | null;
    price_market: number;
  }[];

  // 동일 (ticker) 여러 행 합산
  const byTicker = new Map<string, Holding>();
  for (const r of rows) {
    const d = decryptHoldingFields(r);
    const qty = d.quantity ?? 0;
    const cost = d.avg_cost ?? 0;
    const manual = d.manual_price;
    const price = manual !== null && manual !== undefined && manual > 0 ? manual : (r.price_market || cost);
    if (qty <= 0) continue;
    const valueNative = qty * price;
    const costNative = qty * cost;
    const valueKrw = r.currency === "USD" ? valueNative * exchangeRate : valueNative;
    const existing = byTicker.get(r.ticker);
    if (existing) {
      const totalQty = existing.quantity + qty;
      existing.valueKrw += valueKrw;
      // 가중 평단/현재가 재계산은 생략 — 가치 합산 위주
      existing.quantity = totalQty;
    } else {
      const gainLossPct = costNative > 0 ? ((valueNative - costNative) / costNative) * 100 : 0;
      byTicker.set(r.ticker, {
        ticker: r.ticker, name: r.name, currency: r.currency,
        quantity: qty, avg_cost: cost, current_price: price,
        valueKrw, pct: 0, gainLossPct: Math.round(gainLossPct * 10) / 10,
      });
    }
  }

  const holdings = [...byTicker.values()];
  const total = holdings.reduce((s, h) => s + h.valueKrw, 0);
  for (const h of holdings) h.pct = total > 0 ? Math.round((h.valueKrw / total) * 1000) / 10 : 0;
  return holdings.sort((a, b) => b.pct - a.pct);
}

export async function getPreviousFocus(sql: Sql, userId: number, period: DigestPeriod, beforeDate: string): Promise<Map<string, FocusPoint>> {
  const rows = await sql`
    SELECT focus FROM digests
    WHERE user_id = ${userId} AND period = ${period} AND date < ${beforeDate}
    ORDER BY date DESC LIMIT 1
  ` as { focus: FocusPoint[] | null }[];
  const map = new Map<string, FocusPoint>();
  if (rows.length > 0 && Array.isArray(rows[0].focus)) {
    for (const f of rows[0].focus) map.set(f.ticker, f);
  }
  return map;
}

/** 직전 스냅샷 대비 결정적 변화(목표가/등급) 계산 — AI에 힌트로 제공 + 저장. */
export function computeMetaChange(snap: AnalystSnapshot | null, prev: FocusPoint | undefined): string {
  if (!snap || !prev) return "";
  const parts: string[] = [];
  if (prev.rating && snap.rating && prev.rating !== snap.rating) {
    parts.push(`투자의견 ${prev.rating}→${snap.rating}`);
  }
  if (prev.targetPrice != null && snap.targetMean != null && prev.targetPrice > 0) {
    const delta = ((snap.targetMean - prev.targetPrice) / prev.targetPrice) * 100;
    if (Math.abs(delta) >= 1) {
      parts.push(`평균목표가 ${Math.round(prev.targetPrice)}→${Math.round(snap.targetMean)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`);
    }
  }
  return parts.join(", ");
}

interface TickerInput {
  holding: Holding;
  news: NewsItem[];
  snapshot: AnalystSnapshot | null;
  metaChange: string;
}

/** 포트폴리오 집계 요약 한 줄 — 종합의견(안정성·집중도) 판단용. */
export function summarizePortfolio(rows: { pct: number; gainLossPct: number }[]): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const top3 = sorted.slice(0, 3).reduce((s, r) => s + r.pct, 0);
  const weightedReturn = rows.reduce((s, r) => s + (r.pct / 100) * r.gainLossPct, 0);
  const gainers = rows.filter((r) => r.gainLossPct > 0).length;
  const losers = rows.filter((r) => r.gainLossPct < 0).length;
  return `종목 ${rows.length}개 · 최대비중 ${sorted[0].pct}% · 상위3 집중도 ${Math.round(top3)}% · 가중평균수익률 ${weightedReturn > 0 ? "+" : ""}${weightedReturn.toFixed(1)}% · 상승 ${gainers}/하락 ${losers}`;
}

function buildContext(period: DigestPeriod, inputs: TickerInput[]): string {
  const lines: string[] = [];
  lines.push(`# ${PERIOD_LABEL[period]} 보유종목 브리핑 입력 데이터 (기준: ${todayKST()})`);
  lines.push(`\n## 포트폴리오 종합\n${summarizePortfolio(inputs.map((i) => i.holding))}`);
  for (const inp of inputs) {
    const h = inp.holding;
    lines.push(`\n## ${h.ticker} ${h.name} — 비중 ${h.pct}%, 수익률 ${h.gainLossPct > 0 ? "+" : ""}${h.gainLossPct}%`);
    if (inp.snapshot) {
      const s = inp.snapshot;
      lines.push(`- 애널리스트: 투자의견 ${s.rating ?? "N/A"}, 평균목표가 ${s.targetMean ?? "N/A"} (분석가 ${s.numberOfAnalysts ?? "?"}명)`);
      if (s.recentRatingChanges.length > 0) {
        lines.push(`- 최근 등급변경: ${s.recentRatingChanges.map(c => `${c.firm} ${c.action} ${c.from ?? ""}→${c.to ?? ""} (${c.date})`).join("; ")}`);
      }
    }
    if (inp.metaChange) lines.push(`- ⚠ 전 기간 대비 변화: ${inp.metaChange}`);
    if (inp.news.length > 0) {
      lines.push(`- 뉴스:`);
      for (const n of inp.news.slice(0, 6)) {
        lines.push(`  - [${n.source}] ${n.title}${n.summary ? ` — ${n.summary.slice(0, 140)}` : ""}`);
      }
    } else {
      lines.push(`- 뉴스: (해당 기간 수집된 헤드라인 없음)`);
    }
  }
  return lines.join("\n");
}

interface AiOutput {
  briefing_md: string;
  highlights: { ticker: string; thesis: string; changeNote: string }[];
}

async function synthesize(period: DigestPeriod, context: string): Promise<AiOutput> {
  const system = `당신은 개인 투자자를 위한 ${PERIOD_LABEL[period]} 포트폴리오 브리핑 애널리스트입니다.
제공된 보유종목별 뉴스·애널리스트 데이터만 근거로, 과장 없이 사실 중심으로 작성하세요. 데이터에 없는 내용을 지어내지 마세요.
반드시 아래 JSON 스키마로만 응답하세요(한국어):
{
  "briefing_md": "마크다운 브리핑. 구성: (1) ## 한눈에 — 3~5줄 핵심 요약, (2) ## 주안점 변화 — 투자의견/목표가/중대 뉴스 변화가 있는 종목만 불릿, (3) ## 종목별 — 각 종목 한두 줄, (4) ## 포트폴리오 종합의견 — 집중도·손익분포·뉴스/애널리스트 신호를 근거로 (a) 안정성/리스크 평가, (b) 지금 어떻게 할지 권고(리밸런싱·비중조절·관망 등). 단정적 매수/매도 지시 대신 근거 기반 제안으로. 금액·비중 수치는 데이터에 있는 것만 인용.",
  "highlights": [ { "ticker": "AAPL", "thesis": "한 줄 핵심", "changeNote": "전 기간 대비 변화 한 줄(없으면 빈 문자열)" } ]
}`;
  const res = await client.chat.completions.create({
    ...DEFAULT_AI_PARAMS_JSON,
    max_completion_tokens: 6000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: context },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("AI 빈 응답");
  const parsed = JSON.parse(text) as Partial<AiOutput>;
  return {
    briefing_md: parsed.briefing_md ?? "",
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}

/**
 * 한 사용자의 다이제스트를 생성·저장하고 레코드를 반환.
 * 보유종목 없으면 null.
 */
export async function generateDigest(userId: number, period: DigestPeriod): Promise<DigestRecord | null> {
  const sql = getDb();
  await ensureDigestTable(sql);

  const exchangeRate = await getLatestExchangeRate();
  const allHoldings = await getUserHoldings(sql, userId, exchangeRate);
  if (allHoldings.length === 0) return null;

  const holdings = allHoldings.slice(0, MAX_TICKERS);
  const truncated = allHoldings.length - holdings.length;
  const date = todayKST();
  const prevFocus = await getPreviousFocus(sql, userId, period, date);
  const sinceDays = PERIOD_DAYS[period];

  const inputs: TickerInput[] = await Promise.all(
    holdings.map(async (h) => {
      const [news, snapshot] = await Promise.all([
        getStockNews(h.ticker, h.name, sinceDays),
        getAnalystSnapshot(h.ticker),
      ]);
      return { holding: h, news, snapshot, metaChange: computeMetaChange(snapshot, prevFocus.get(h.ticker)) };
    }),
  );

  const context = buildContext(period, inputs);
  const ai = await synthesize(period, context);

  const hlByTicker = new Map(ai.highlights.map((h) => [h.ticker, h]));
  const focus: FocusPoint[] = inputs.map((inp) => {
    const hl = hlByTicker.get(inp.holding.ticker);
    return {
      ticker: inp.holding.ticker,
      name: inp.holding.name,
      rating: inp.snapshot?.rating ?? null,
      targetPrice: inp.snapshot?.targetMean ?? null,
      thesis: hl?.thesis ?? "",
      // 결정적 변화(metaChange) 우선, 없으면 AI 변화 노트
      changeNote: inp.metaChange || hl?.changeNote || "",
    };
  });

  let footer = "";
  if (truncated > 0) footer = `\n\n---\n_비중 상위 ${holdings.length}개 종목만 분석 (${truncated}개 제외)._`;
  const content = (ai.briefing_md || "_브리핑 생성 실패_") + footer;

  return persistDigest(userId, period, date, content, focus, truncated);
}

/** 다이제스트 1건 upsert 후 레코드 반환 (파이프라인·에이전트 공용). */
export async function persistDigest(
  userId: number, period: DigestPeriod, date: string,
  content: string, focus: FocusPoint[], truncated = 0,
): Promise<DigestRecord> {
  const sql = getDb();
  await ensureDigestTable(sql);
  const rows = await sql`
    INSERT INTO digests (user_id, period, date, content_enc, focus)
    VALUES (${userId}, ${period}, ${date}, ${encrypt(content)}, ${JSON.stringify(focus)}::jsonb)
    ON CONFLICT (user_id, period, date)
    DO UPDATE SET content_enc = EXCLUDED.content_enc, focus = EXCLUDED.focus, created_at = now()
    RETURNING id, created_at
  ` as { id: number; created_at: string }[];
  return { id: rows[0].id, period, date, content, focus, created_at: rows[0].created_at, truncated };
}

/** 사용자의 다이제스트 목록(기간 필터 옵션). 본문 복호화 포함. */
export async function listDigests(userId: number, period?: DigestPeriod, limit = 30): Promise<DigestRecord[]> {
  const sql = getDb();
  await ensureDigestTable(sql);
  const rows = period
    ? await sql`SELECT id, period, date, content_enc, focus, created_at FROM digests
                WHERE user_id = ${userId} AND period = ${period} ORDER BY date DESC LIMIT ${limit}`
    : await sql`SELECT id, period, date, content_enc, focus, created_at FROM digests
                WHERE user_id = ${userId} ORDER BY date DESC LIMIT ${limit}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map((r) => ({
    id: r.id,
    period: r.period as DigestPeriod,
    date: r.date,
    content: decrypt(r.content_enc) ?? "",
    focus: Array.isArray(r.focus) ? r.focus : [],
    created_at: r.created_at,
  }));
}

/** 푸시 알림용 짧은 요약 — 변화가 있는 종목 위주. */
export function buildPushSummary(rec: DigestRecord): string {
  const changed = rec.focus.filter((f) => f.changeNote).slice(0, 3);
  if (changed.length > 0) {
    return changed.map((f) => `${f.name}: ${f.changeNote}`).join(" · ");
  }
  const names = rec.focus.slice(0, 4).map((f) => f.name).join(", ");
  return names ? `${names} 등 ${rec.focus.length}개 종목 업데이트` : "오늘의 보유종목 브리핑이 준비됐어요";
}
