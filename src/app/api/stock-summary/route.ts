import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { DEFAULT_AI_PARAMS_JSON } from "@/lib/ai-config";

export const maxDuration = 60;

export interface StockSummarySignal {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
}

export interface StockSummaryResponse {
  stance: "bullish" | "neutral" | "bearish";
  thesis: string;
  signals: StockSummarySignal[];
}

/** 클라이언트가 이미 가진 지표를 받아 AI 테제 생성 (재조회 없이 빠르게) */
interface SummaryContext {
  ticker: string;
  name: string;
  currency: string;
  metrics: Record<string, number | string | null>;
  exportTrend?: { item: string; latestYymm: string; latestUsd: number; latestYoY: number | null } | null;
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY 미설정" }, { status: 503 });
  }
  let ctx: SummaryContext;
  try {
    ctx = (await req.json()) as SummaryContext;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!ctx?.ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const exportLine = ctx.exportTrend
    ? `\n수출추이(대표품목 ${ctx.exportTrend.item}): 최신 ${ctx.exportTrend.latestYymm} ${(ctx.exportTrend.latestUsd / 1e9).toFixed(2)}B달러, 전년동월비 ${ctx.exportTrend.latestYoY == null ? "N/A" : ctx.exportTrend.latestYoY.toFixed(1) + "%"}`
    : "";

  const system = `당신은 개인 투자자를 위한 주식 애널리스트입니다.
제공된 지표만 근거로, 과장 없이 사실 중심으로 한국어로 종합 의견을 작성하세요. 데이터에 없는 내용을 지어내지 마세요.
밸류에이션(고/저평가), 성장성, 수익성, (있다면)수출 모멘텀을 종합해 한 종목의 현재 상태를 압축하세요.
반드시 아래 JSON 스키마로만 응답:
{
  "stance": "bullish" | "neutral" | "bearish",
  "thesis": "2~3문장 핵심 테제(한국어). 밸류·성장·수익성·수출을 엮어 균형있게.",
  "signals": [ { "label": "짧은 신호명", "detail": "한 줄 설명", "tone": "positive"|"negative"|"neutral" } ]
}
signals는 3~5개. 근거가 약하면 neutral로.`;

  const user = `종목: ${ctx.name} (${ctx.ticker}, ${ctx.currency})
지표: ${JSON.stringify(ctx.metrics)}${exportLine}`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      ...DEFAULT_AI_PARAMS_JSON,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("AI 빈 응답");
    const parsed = JSON.parse(text) as Partial<StockSummaryResponse>;
    const stance = parsed.stance === "bullish" || parsed.stance === "bearish" ? parsed.stance : "neutral";
    const result: StockSummaryResponse = {
      stance,
      thesis: typeof parsed.thesis === "string" ? parsed.thesis : "",
      signals: Array.isArray(parsed.signals)
        ? parsed.signals
            .filter((s): s is StockSummarySignal => !!s && typeof s.label === "string")
            .map((s): StockSummarySignal => ({
              label: s.label,
              detail: typeof s.detail === "string" ? s.detail : "",
              tone: s.tone === "positive" || s.tone === "negative" ? s.tone : "neutral",
            }))
            .slice(0, 5)
        : [],
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI 생성 실패" }, { status: 502 });
  }
}
