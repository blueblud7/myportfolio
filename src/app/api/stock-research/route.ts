import { NextRequest, NextResponse } from "next/server";
import { getDeepSeek, DEEPSEEK_MODEL, isDeepSeekConfigured } from "@/lib/deepseek";
import { getStockNews, getAnalystSnapshot } from "@/lib/news";
import { getFinnhubEarnings } from "@/lib/finnhub";
import { webSearch, isWebSearchConfigured } from "@/lib/websearch";
import { getExportMapping } from "@/lib/export-mapping";
import { getExportTrend } from "@/lib/korea-export";

export const maxDuration = 120;

const MAX_STEPS = 10;

export interface StockResearchResponse {
  stance: "bullish" | "neutral" | "bearish";
  report_md: string;
  bullish: string[];
  bearish: string[];
  toolCalls: number;
}

/** 관세청 데이터 지연 → 2달 전을 종료 연월로 */
function defaultEndYymm(): string {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}`;
}

function toolDefs(ticker: string, hasExport: boolean, webEnabled: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [
    { type: "function", function: { name: "get_news", description: `${ticker}의 최근 뉴스 헤드라인.`, parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "get_analyst_snapshot", description: `${ticker}의 애널리스트 투자의견·평균목표가·최근 등급변경.`, parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "get_earnings", description: `${ticker}의 최근 실적(EPS 서프라이즈) 이력.`, parameters: { type: "object", properties: {} } } },
  ];
  if (hasExport) {
    tools.push({ type: "function", function: { name: "get_export_trend", description: `${ticker}의 대표 수출품목 월별 수출액·전년동월비 추이(관세청). 실적 선행지표.`, parameters: { type: "object", properties: {} } } });
  }
  if (webEnabled) {
    tools.push({ type: "function", function: { name: "web_search", description: "공개 웹에서 최신 정보 검색. 배경·원인을 찾을 때.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } });
  }
  return tools;
}

export async function POST(req: NextRequest) {
  if (!isDeepSeekConfigured()) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }
  let body: { ticker?: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }
  const ticker = (body.ticker ?? "").trim();
  const name = (body.name ?? ticker).trim();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const mapping = getExportMapping(ticker);
  const hasExport = mapping !== null;
  const webEnabled = isWebSearchConfigured();

  async function runTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case "get_news":
        return (await getStockNews(ticker, name, 30)).slice(0, 10);
      case "get_analyst_snapshot":
        return await getAnalystSnapshot(ticker);
      case "get_earnings":
        return (await getFinnhubEarnings(ticker))?.slice(0, 6) ?? null;
      case "get_export_trend": {
        if (!mapping) return null;
        const t = await getExportTrend(mapping.hs, defaultEndYymm(), 12, "");
        if (!t) return { note: "수출 데이터 없음(키 미설정 또는 조회 실패)" };
        return { item: mapping.item, latest: t.latest, recent: t.months.slice(-6) };
      }
      case "web_search":
        return await webSearch(typeof args.query === "string" ? args.query : "", 5);
      default:
        return { error: `unknown tool: ${toolName}` };
    }
  }

  const system = `당신은 한 종목(${name}, ${ticker})을 깊이 조사하는 주식 리서치 에이전트입니다.
- 도구(get_news, get_analyst_snapshot, get_earnings${hasExport ? ", get_export_trend" : ""}${webEnabled ? ", web_search" : ""})를 자율적으로 호출해 사실을 모으세요.
- 강세(bullish) 논거와 약세(bearish) 논거를 균형있게 찾으세요. 한쪽만 보지 마세요.
- 애널리스트 변화, 실적 서프라이즈, 중대 뉴스${hasExport ? ", 수출 모멘텀" : ""}의 "원인"에 집중.
- 도구 호출은 효율적으로. 충분히 모았으면 멈추세요.
근거 없는 추측 금지, 도구로 얻은 사실 기반. 최종 답변은 한국어.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: `${name}(${ticker})을 조사한 뒤 강세/약세 논거를 종합해 주세요.` },
  ];

  const client = getDeepSeek();
  const tools = toolDefs(ticker, hasExport, webEnabled);
  let toolCalls = 0;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.chat.completions.create({
        model: DEEPSEEK_MODEL, messages, tools, tool_choice: "auto", max_tokens: 2500,
      });
      const msg = res.choices[0]?.message;
      if (!msg) break;
      messages.push(msg);
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) break;
      for (const call of calls) {
        if (call.type !== "function") continue;
        toolCalls++;
        let result: unknown;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          result = await runTool(call.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 4000) });
      }
    }

    messages.push({
      role: "user",
      content: `이제 조사 내용을 종합해 JSON으로만 출력하세요:
{
  "stance": "bullish" | "neutral" | "bearish",
  "report_md": "마크다운 리포트. (1) ## 한눈에 2~3줄 (2) ## 강세 요인 (3) ## 약세 요인 (4) ## 종합 — 균형된 결론과 지켜볼 포인트. 단정적 매수/매도 지시 대신 근거 기반.",
  "bullish": ["강세 논거 한 줄", ...],
  "bearish": ["약세 논거 한 줄", ...]
}`,
    });
    const finalRes = await client.chat.completions.create({
      model: DEEPSEEK_MODEL, messages, max_tokens: 4000, response_format: { type: "json_object" },
    });
    const text = finalRes.choices[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("에이전트 응답이 비었습니다");
    const parsed = JSON.parse(text) as Partial<StockResearchResponse>;
    const stance = parsed.stance === "bullish" || parsed.stance === "bearish" ? parsed.stance : "neutral";
    const result: StockResearchResponse = {
      stance,
      report_md: typeof parsed.report_md === "string" ? parsed.report_md : "",
      bullish: Array.isArray(parsed.bullish) ? parsed.bullish.filter((x): x is string => typeof x === "string") : [],
      bearish: Array.isArray(parsed.bearish) ? parsed.bearish.filter((x): x is string => typeof x === "string") : [],
      toolCalls,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "리서치 실패" }, { status: 502 });
  }
}
