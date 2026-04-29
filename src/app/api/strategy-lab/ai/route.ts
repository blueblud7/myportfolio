import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionUser } from "@/lib/auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategyResult {
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number | null;
  totalTrades: number;
}

interface StrategyDef {
  name: string;
  nameEn: string;
  description: string;
  results: Record<string, StrategyResult | null>;
}

interface AnalyzeRequest {
  type: "analyze";
  results: Record<string, StrategyDef>;
  tickers: string[];
  period: string;
}

interface CustomStrategyRequest {
  type: "custom_strategy";
  description: string;
  tickers?: string[];
  period?: string;
}

type RequestBody = AnalyzeRequest | CustomStrategyRequest;

// ─── Analyze handler ──────────────────────────────────────────────────────────

async function handleAnalyze(body: AnalyzeRequest): Promise<NextResponse> {
  const { results, tickers, period } = body;

  // Build summary table for prompt
  const strategyIds = Object.keys(results);
  const lines: string[] = [];

  for (const sid of strategyIds) {
    const strat = results[sid];
    for (const ticker of tickers) {
      const r = strat.results[ticker];
      if (!r) continue;
      lines.push(
        `- ${strat.name} / ${ticker}: CAGR=${r.cagr.toFixed(2)}%, 총수익=${r.totalReturn.toFixed(2)}%, MDD=${r.mdd.toFixed(2)}%, Sharpe=${r.sharpe.toFixed(3)}, WinRate=${r.winRate != null ? r.winRate.toFixed(1) + "%" : "N/A"}, 거래수=${r.totalTrades}`
      );
    }
  }

  const periodLabel: Record<string, string> = {
    "1y": "1년",
    "3y": "3년",
    "5y": "5년",
    "10y": "10년",
    max: "최대",
  };

  const prompt = `다음은 ${periodLabel[period] ?? period} 기간 동안 ${tickers.join(", ")} 티커에 대한 8가지 투자 전략 백테스트 결과입니다.

## 백테스트 결과
${lines.join("\n")}

위 결과를 바탕으로 다음 항목을 분석해 주세요:

1. **최고 성과 전략 (CAGR 기준)**: 어떤 전략이 가장 높은 연평균 수익률을 기록했나요?
2. **리스크 조정 최우수 전략 (Sharpe 기준)**: 위험 대비 수익이 가장 우수한 전략은?
3. **최저 성과 전략**: 성과가 가장 저조한 전략과 그 이유는?
4. **티커별 인사이트**: 각 종목에서 특이점이나 패턴이 있나요?
5. **전략 추천**: 현재 시장 환경을 고려할 때 어떤 전략이 적합한가요?
6. **리스크 관리 관점**: MDD와 Sharpe를 종합적으로 볼 때 주목할 점은?

마크다운 형식으로 구조화하여 한국어로 답변해 주세요. 각 항목은 ##로 구분하세요.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-nano",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content:
          "당신은 퀀트 투자 전략 전문가입니다. 백테스트 결과를 분석하여 투자자가 이해하기 쉬운 한국어로 설명합니다. 수치 기반의 근거 있는 분석을 제공하세요.",
      },
      { role: "user", content: prompt },
    ],
  });

  const analysis = completion.choices[0]?.message?.content ?? "";
  return NextResponse.json({ analysis });
}

// ─── Custom strategy handler ──────────────────────────────────────────────────

async function handleCustomStrategy(body: CustomStrategyRequest): Promise<NextResponse> {
  const { description } = body;

  const prompt = `사용자가 다음과 같은 투자 전략을 설명했습니다:

"${description}"

이 설명을 분석하여 아래 JSON 형식으로 구조화된 전략 파라미터를 반환해 주세요.
반드시 유효한 JSON만 반환하세요. 추가 설명은 불필요합니다.

{
  "name": "전략 이름 (한국어)",
  "description": "전략 설명 (한국어, 2-3문장)",
  "rules": {
    "buyCondition": "매수 조건 설명",
    "sellCondition": "매도 조건 설명",
    "indicator": "RSI|SMA|EMA|MACD|BB|MOMENTUM",
    "params": {
      "period": 14,
      "buyThreshold": 30,
      "sellThreshold": 70
    }
  }
}

indicator 값은 반드시 RSI, SMA, EMA, MACD, BB, MOMENTUM 중 하나여야 합니다.
params는 전략에 맞게 적절히 수정하세요. 예: SMA면 shortPeriod, longPeriod 등.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-nano",
    max_completion_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "당신은 투자 전략 파서입니다. 사용자의 전략 설명을 JSON 구조로 변환합니다. 반드시 유효한 JSON만 반환하세요.",
      },
      { role: "user", content: prompt },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content ?? "{}";

  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = rawContent.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let strategyConfig: Record<string, unknown>;
  try {
    strategyConfig = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    strategyConfig = {
      name: "커스텀 전략",
      description: description,
      rules: {
        buyCondition: description,
        sellCondition: "조건 미충족 시 매도",
        indicator: "RSI",
        params: { period: 14, buyThreshold: 30, sellThreshold: 70 },
      },
    };
  }

  return NextResponse.json({ strategy: strategyConfig });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as RequestBody;

    if (body.type === "analyze") {
      return await handleAnalyze(body as AnalyzeRequest);
    } else if (body.type === "custom_strategy") {
      return await handleCustomStrategy(body as CustomStrategyRequest);
    } else {
      return NextResponse.json({ error: "Invalid type. Use 'analyze' or 'custom_strategy'." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
