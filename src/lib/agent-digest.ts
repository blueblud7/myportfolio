import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { getDeepSeek, DEEPSEEK_MODEL, isDeepSeekConfigured } from "./deepseek";
import { getStockNews, getAnalystSnapshot } from "./news";
import { getFinnhubEarnings } from "./finnhub";
import { webSearch, isWebSearchConfigured } from "./websearch";
import { todayKST } from "./tz";
import {
  getUserHoldings, getPreviousFocus, computeMetaChange, persistDigest, summarizePortfolio,
  PERIOD_DAYS, type DigestPeriod, type DigestRecord, type FocusPoint, type Holding,
} from "./digest";

const MAX_TICKERS = 10;     // 에이전트는 비용↑ → 비중 상위 10개
const MAX_STEPS = 14;       // 도구 호출 라운드 상한 (무한루프·비용 방지)
const PERIOD_LABEL: Record<DigestPeriod, string> = { daily: "데일리", weekly: "위클리", monthly: "먼슬리" };

// ── 도구 정의 (OpenAI/DeepSeek function calling) ──────────────────────────────
function toolDefs(webEnabled: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [
    { type: "function", function: { name: "get_news", description: "특정 보유종목의 최근 뉴스 헤드라인을 가져온다.", parameters: { type: "object", properties: { ticker: { type: "string", description: "보유종목 티커" } }, required: ["ticker"] } } },
    { type: "function", function: { name: "get_analyst_snapshot", description: "특정 종목의 애널리스트 투자의견·평균목표가·최근 등급변경 이력.", parameters: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] } } },
    { type: "function", function: { name: "get_earnings", description: "특정 종목의 최근 실적(EPS 서프라이즈) 이력.", parameters: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] } } },
  ];
  if (webEnabled) {
    tools.push({ type: "function", function: { name: "web_search", description: "공개 웹에서 최신 뉴스/정보를 검색한다. 우리 데이터에 없는 배경·원인을 찾을 때 사용.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } });
  }
  return tools;
}

async function runTool(name: string, args: Record<string, unknown>, nameMap: Map<string, string>, sinceDays: number): Promise<unknown> {
  const ticker = typeof args.ticker === "string" ? args.ticker : "";
  switch (name) {
    case "get_news":
      return (await getStockNews(ticker, nameMap.get(ticker) ?? ticker, sinceDays)).slice(0, 8);
    case "get_analyst_snapshot":
      return await getAnalystSnapshot(ticker);
    case "get_earnings":
      return (await getFinnhubEarnings(ticker))?.slice(0, 4) ?? null;
    case "web_search":
      return await webSearch(typeof args.query === "string" ? args.query : "", 5);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

interface FinalOutput {
  briefing_md: string;
  highlights: { ticker: string; thesis: string; changeNote: string; rating?: string | null; targetPrice?: number | null }[];
}

/**
 * 에이전트형 다이제스트: DeepSeek가 도구를 자율 호출하며 보유종목을 조사 → 종합.
 * DEEPSEEK_API_KEY 미설정 시 에러. 보유종목 없으면 null.
 */
export async function generateAgentDigest(userId: number, period: DigestPeriod): Promise<DigestRecord | null> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DEEPSEEK_API_KEY가 설정되지 않았습니다. 에이전트 모드를 쓰려면 환경변수를 추가하세요.");
  }
  const sql = getDb();
  const exchangeRate = await getLatestExchangeRate();
  const allHoldings = await getUserHoldings(sql, userId, exchangeRate);
  if (allHoldings.length === 0) return null;

  const holdings = allHoldings.slice(0, MAX_TICKERS);
  const truncated = allHoldings.length - holdings.length;
  const date = todayKST();
  const prevFocus = await getPreviousFocus(sql, userId, period, date);
  const sinceDays = PERIOD_DAYS[period];
  const nameMap = new Map<string, string>(holdings.map((h) => [h.ticker, h.name]));
  const webEnabled = isWebSearchConfigured();

  const holdingLines = holdings
    .map((h: Holding) => `- ${h.ticker} (${h.name}): 비중 ${h.pct}%, 수익률 ${h.gainLossPct > 0 ? "+" : ""}${h.gainLossPct}%`)
    .join("\n");
  const prevLines = [...prevFocus.values()]
    .map((f) => `- ${f.ticker}: 투자의견 ${f.rating ?? "?"}, 목표가 ${f.targetPrice ?? "?"}${f.thesis ? `, 직전요지: ${f.thesis}` : ""}`)
    .join("\n");

  const system = `당신은 개인 투자자를 위한 ${PERIOD_LABEL[period]} 포트폴리오 리서치 에이전트입니다.
주어진 보유종목들에 대해 최근 ${sinceDays}일간의 중요한 변화를 도구로 직접 조사하세요.
- 도구(get_news, get_analyst_snapshot, get_earnings${webEnabled ? ", web_search" : ""})를 필요에 따라 자율적으로 호출하세요.
- 투자의견·목표가 변화, 실적, 중대 뉴스, 큰 주가 변동의 "원인"에 집중하세요.
- 모든 종목을 똑같이 파지 말고, 변화가 큰 종목을 우선 깊게 조사하세요.
- 도구 호출은 효율적으로(불필요한 반복 금지). 충분히 모았으면 멈추세요.
근거 없는 추측은 하지 말고, 도구로 얻은 사실에 기반하세요. 최종 답변은 한국어.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: `## 포트폴리오 종합\n${summarizePortfolio(holdings)}\n\n## 내 보유종목 (비중순)\n${holdingLines}\n\n${prevLines ? `## 직전 ${PERIOD_LABEL[period]} 브리핑 요지 (변화 비교용)\n${prevLines}\n\n` : ""}위 종목들을 조사한 뒤 알려줄게요.` },
  ];

  const client = getDeepSeek();
  const tools = toolDefs(webEnabled);
  let toolCallCount = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 3000,
    });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) break; // 더 이상 도구 안 부르면 조사 종료

    for (const call of calls) {
      if (call.type !== "function") continue;
      toolCallCount++;
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        result = await runTool(call.function.name, args, nameMap, sinceDays);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 4000) });
    }
  }

  // 최종 종합 (도구 없이 JSON 강제)
  messages.push({
    role: "user",
    content: `이제 조사한 내용을 종합해 최종 브리핑을 JSON으로만 출력하세요:
{
  "briefing_md": "마크다운. (1) ## 한눈에 3~5줄 (2) ## 주안점 변화 — 변화 있는 종목만 (3) ## 종목별 요약 (4) ## 포트폴리오 종합의견 — 집중도·손익분포·수집한 뉴스/애널리스트 신호를 근거로 (a) 안정성/리스크 평가, (b) 지금 어떻게 할지 권고(리밸런싱·비중조절·관망 등). 단정적 매수/매도 지시 대신 근거 기반 제안.",
  "highlights": [ { "ticker": "...", "thesis": "한 줄 핵심", "changeNote": "전 기간 대비 변화(없으면 빈 문자열)", "rating": "투자의견 또는 null", "targetPrice": 평균목표가숫자또는null } ]
}`,
  });
  const finalRes = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages,
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });
  const text = finalRes.choices[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("에이전트 최종 응답이 비었습니다");
  const parsed = JSON.parse(text) as Partial<FinalOutput>;
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
  const hlByTicker = new Map(highlights.map((h) => [h.ticker, h]));

  const focus: FocusPoint[] = holdings.map((h) => {
    const hl = hlByTicker.get(h.ticker);
    const rating = hl?.rating ?? null;
    const targetPrice = typeof hl?.targetPrice === "number" ? hl.targetPrice : null;
    const meta = computeMetaChange(
      { rating, targetMean: targetPrice, numberOfAnalysts: null, recentRatingChanges: [] },
      prevFocus.get(h.ticker),
    );
    return {
      ticker: h.ticker, name: h.name, rating, targetPrice,
      thesis: hl?.thesis ?? "",
      changeNote: meta || hl?.changeNote || "",
    };
  });

  const footerParts = [`🤖 에이전트 분석 (도구 ${toolCallCount}회 호출${webEnabled ? ", 웹검색 포함" : ""})`];
  if (truncated > 0) footerParts.push(`비중 상위 ${holdings.length}개 종목만 분석 (${truncated}개 제외)`);
  const content = (parsed.briefing_md || "_브리핑 생성 실패_") + `\n\n---\n_${footerParts.join(" · ")}._`;

  return persistDigest(userId, period, date, content, focus, truncated);
}
