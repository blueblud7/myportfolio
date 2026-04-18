import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { SentimentData } from "@/app/api/fomo-sentiment/route";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CACHE_TTL = 60 * 60 * 1000; // 1시간
let cache: { data: AgentsResult; ts: number } | null = null;

export interface AgentAnalysis {
  id: string;
  name: string;
  style: string;
  weight: number;
  action: "Buy" | "Hold" | "Sell";
  fomoScore: number;
  interpretation: string;
  actionReason: string;
  warning: string;
  innerMonologue: string;
  biasesDetected: string[];
}

export interface AgentsResult {
  agents: AgentAnalysis[];
  consensus: {
    buyPct: number;
    holdPct: number;
    sellPct: number;
    avgFomoScore: number;
    weightedAction: "Buy" | "Hold" | "Sell";
  };
  timestamp: string;
}

const AGENT_PROFILES = [
  { id: "A01", name: "20대 남성 공격형", style: "공격적 모멘텀", weight: 3, systemPrompt: "당신은 20대 초반 남성 투자자입니다. 투자 경험이 1년 미만이며, SNS와 유튜브에서 투자 정보를 얻습니다. FOMO에 매우 취약하며, 레버리지 ETF와 급등주에 관심이 많습니다. 손절보다 물타기를 선호하고, 단기 가격 움직임에 민감합니다." },
  { id: "A02", name: "20대 여성 성장형", style: "성장 추구형", weight: 3, systemPrompt: "당신은 20대 초반 여성 투자자입니다. ETF 중심으로 신중하게 접근합니다. 트렌드 섹터를 따라가되 손절라인을 철저히 지킵니다. 커뮤니티 의견을 참고하지만 감정적 매매는 자제합니다." },
  { id: "A03", name: "30대 남성 단타형", style: "공격적 모멘텀", weight: 3, systemPrompt: "당신은 30대 중반 남성 투자자입니다. 5년 경험을 가진 단타 트레이더입니다. 기술적 분석을 중시하고 섹터 로테이션을 자주 활용합니다. 과잉확신 성향이 있습니다." },
  { id: "A04", name: "30대 여성 균형형", style: "균형 성장형", weight: 3, systemPrompt: "당신은 30대 초반 여성 투자자입니다. 배당주 60%, 성장주 40%로 균형 포트폴리오를 운용합니다. 안정성과 성장을 동시에 추구하며 감정보다 데이터를 중시합니다." },
  { id: "A05", name: "40대 남성 스윙트레이더", style: "전략적 스윙", weight: 3, systemPrompt: "당신은 40대 남성 스윙트레이더입니다. 기술적 분석과 매크로 지표를 결합하여 2-4주 단위 매매를 합니다. FOMC, 섹터 로테이션, 지지/저항선을 중요하게 봅니다." },
  { id: "A06", name: "40대 여성 안정형", style: "안정 성장형", weight: 3, systemPrompt: "당신은 40대 여성 투자자입니다. 삼성전자, KB금융 같은 우량주를 장기 보유합니다. 배당 재투자를 선호하며 시장 단기 변동성에는 거의 반응하지 않습니다." },
  { id: "A07", name: "50대+ 남성 집중투자자", style: "공격적 집중 투자", weight: 3, systemPrompt: "당신은 50대 이상 남성 투자자입니다. 장기 경험을 바탕으로 특정 섹터에 집중투자합니다. 공포 구간을 매수 기회로 보며 역사적 데이터를 중요하게 활용합니다." },
  { id: "A08", name: "50대+ 여성 보수적 장기투자자", style: "보수적 장기 투자", weight: 3, systemPrompt: "당신은 50대 이상 여성 투자자입니다. 30년 장기 보유 원칙을 철저히 지킵니다. 배당이 나오는 우량주를 선호하며 단기 시장 소음에는 전혀 반응하지 않습니다." },
  { id: "A09", name: "FOMO 과열형", style: "FOMO 과열형", weight: 2, systemPrompt: "당신은 극도로 FOMO에 취약한 투자자입니다. SNS에서 급등 소식을 보면 즉각 반응합니다. 손절 계획 없이 레버리지를 사용하는 경향이 강합니다. 감정이 판단을 완전히 지배합니다." },
  { id: "A10", name: "공포 회피형", style: "공포 회피형", weight: 2, systemPrompt: "당신은 손실 회피 성향이 매우 강한 투자자입니다. 시장 불안 신호가 보이면 즉각 현금화를 선호합니다. 패닉셀링 경험이 많으며 재진입 타이밍을 자주 놓칩니다." },
  { id: "A11", name: "역발상 컨트라리안", style: "역발상 컨트라리안", weight: 2, systemPrompt: "당신은 역발상 투자자입니다. 군중이 공포에 떨 때 매수하고 탐욕스러울 때 매도합니다. S&P500 역사적 데이터와 밸류에이션을 중요하게 봅니다. 분할 매수로 리스크를 관리합니다." },
  { id: "A12", name: "패시브 인덱스 투자자", style: "패시브 인덱스", weight: 2, systemPrompt: "당신은 DCA(달러 코스트 에버리징) 전략의 패시브 인덱스 투자자입니다. 매월 정해진 금액을 KOSPI ETF, S&P500 ETF에 자동 적립합니다. 시장 타이밍 시도를 하지 않습니다." },
];

function buildUserPrompt(sentiment: SentimentData): string {
  return `현재 시장 데이터:

## 심리 점수 (0=극단적공포, 100=극단적탐욕)
- KR 종합: ${sentiment.KR} (${sentiment.labels.KR})
- US 종합: ${sentiment.US} (${sentiment.labels.US})
- 크립토: ${sentiment.Crypto} (${sentiment.labels.Crypto})
- 전체: ${sentiment.Overall} (${sentiment.labels.Overall})

## 시장 지표
- VIX: ${sentiment.raw.vix.toFixed(1)} (전일대비 ${sentiment.raw.vixChange >= 0 ? "+" : ""}${sentiment.raw.vixChange.toFixed(2)})
- 크립토 공포탐욕지수: ${sentiment.raw.cryptoFG} (${sentiment.raw.cryptoLabel})
- KOSPI 등락률: ${sentiment.raw.kospiChangePct >= 0 ? "+" : ""}${sentiment.raw.kospiChangePct.toFixed(2)}%
- KOSDAQ 등락률: ${sentiment.raw.kosdaqChangePct >= 0 ? "+" : ""}${sentiment.raw.kosdaqChangePct.toFixed(2)}%
- S&P500 등락률: ${sentiment.raw.sp500ChangePct >= 0 ? "+" : ""}${sentiment.raw.sp500ChangePct.toFixed(2)}%

위 시장 상황에서 당신의 페르소나로서 반응하세요. 반드시 아래 JSON 형식으로만 응답하세요:

{
  "interpretation": "현재 시장 상황에 대한 당신의 해석 (2-3문장, 페르소나 말투로)",
  "action": "Buy 또는 Hold 또는 Sell 중 하나",
  "action_reason": "행동 이유 (1문장)",
  "fomo_score": 0에서 10 사이 정수 (0=FOMO없음, 10=극단적FOMO),
  "warning": "다른 투자자에게 주는 경고 (1문장)",
  "inner_monologue": "당신의 솔직한 내면의 독백 (2-3문장)",
  "biases_detected": ["편향1", "편향2"]
}`;
}

async function runAgent(profile: typeof AGENT_PROFILES[0], prompt: string): Promise<AgentAnalysis> {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-5-nano",
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: profile.systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    const raw = JSON.parse(res.choices[0].message.content ?? "{}");
    return {
      id: profile.id,
      name: profile.name,
      style: profile.style,
      weight: profile.weight,
      action: ["Buy", "Hold", "Sell"].includes(raw.action) ? raw.action : "Hold",
      fomoScore: Math.min(10, Math.max(0, Number(raw.fomo_score ?? 5))),
      interpretation: raw.interpretation ?? "",
      actionReason: raw.action_reason ?? "",
      warning: raw.warning ?? "",
      innerMonologue: raw.inner_monologue ?? "",
      biasesDetected: Array.isArray(raw.biases_detected) ? raw.biases_detected : [],
    };
  } catch {
    return {
      id: profile.id, name: profile.name, style: profile.style, weight: profile.weight,
      action: "Hold", fomoScore: 5,
      interpretation: "분석 실패", actionReason: "", warning: "", innerMonologue: "", biasesDetected: [],
    };
  }
}

function calcConsensus(agents: AgentAnalysis[]): AgentsResult["consensus"] {
  const total = agents.reduce((s, a) => s + a.weight, 0);
  const buy = agents.filter((a) => a.action === "Buy").reduce((s, a) => s + a.weight, 0);
  const hold = agents.filter((a) => a.action === "Hold").reduce((s, a) => s + a.weight, 0);
  const sell = agents.filter((a) => a.action === "Sell").reduce((s, a) => s + a.weight, 0);
  const buyPct = Math.round((buy / total) * 100);
  const holdPct = Math.round((hold / total) * 100);
  const sellPct = 100 - buyPct - holdPct;
  const avgFomoScore = Math.round(agents.reduce((s, a) => s + a.fomoScore * a.weight, 0) / total * 10) / 10;
  const weightedAction: "Buy" | "Hold" | "Sell" = buy >= hold && buy >= sell ? "Buy" : hold >= sell ? "Hold" : "Sell";
  return { buyPct, holdPct, sellPct, avgFomoScore, weightedAction };
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    // 현재 심리 점수 가져오기
    const sentRes = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/fomo-sentiment`);
    const sentiment: SentimentData = await sentRes.json();

    const prompt = buildUserPrompt(sentiment);

    // 12개 에이전트 병렬 실행
    const agents = await Promise.all(AGENT_PROFILES.map((p) => runAgent(p, prompt)));
    const consensus = calcConsensus(agents);
    const result: AgentsResult = { agents, consensus, timestamp: new Date().toISOString() };

    cache = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
