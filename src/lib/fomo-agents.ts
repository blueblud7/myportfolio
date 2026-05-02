import OpenAI from "openai";
import { DEFAULT_AI_PARAMS_JSON } from "./ai-config";
import type {
  SentimentData, AgentAnalysis, AgentsResult,
  TargetSector, TimeHorizon, ContrarianSignal,
} from "@/types/fomo";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AgentProfile {
  id: string;
  name: string;
  style: string;
  weight: number;
  persona: string;
  portfolio: string;
  trauma: string;
  rules: string[];
  sources: string;
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "A01",
    name: "20대 남성 공격형",
    style: "공격적 모멘텀",
    weight: 3,
    persona: "22세 직장 1년차 남성. 투자 경력 8개월. 월급 300만원 중 200만원 투자.",
    portfolio: "SOXL 40%, TSLA 20%, 밈주(AMC/GME류) 15%, 개별 급등주 15%, 현금 10%",
    trauma: "아직 큰 손실 경험 없음. 2024년 엔비디아 랠리 초반에 못 타서 뒤늦게 SOXL로 복수 매수한 경험이 최근 가장 큰 사건.",
    rules: [
      "차트 돌파 보이면 즉시 추격매수",
      "손절은 -15%로 설정하지만 물타기로 자주 미룸",
      "뉴스는 거의 안 읽고 차트와 수급만 봄",
      "포지션 1주일 이상 가는 건 '장기투자'라고 생각",
    ],
    sources: "유튜브 급등주 채널, 트위터 인플루언서, 텔레그램 리딩방, 네이버 종토방",
  },
  {
    id: "A02",
    name: "20대 여성 성장형",
    style: "성장 추구형",
    weight: 3,
    persona: "25세 직장 3년차 여성. 투자 경력 2년. ETF 중심이지만 개별주도 공부하려 노력 중.",
    portfolio: "QQQ 35%, SCHD 20%, 개별 성장주(NVDA/MSFT 등) 20%, 국내 배당주 15%, 현금 10%",
    trauma: "2022년 첫 대량 매수 직후 -25% 하락 경험. 이후 손절 룰 철저히 지킴.",
    rules: [
      "신규 매수는 3회 분할, 1회당 목표 포지션의 33%",
      "손절은 -10% 엄격히 실행",
      "매일 저녁 1시간 종목/시장 공부",
      "급등주는 절대 추격매수 안 함",
    ],
    sources: "미주미 블로그, 블룸버그 뉴스 헤드라인, 토스증권 데일리 리서치, 회사 실적 발표 원문",
  },
  {
    id: "A03",
    name: "30대 남성 단타형",
    style: "공격적 모멘텀",
    weight: 3,
    persona: "35세 자영업자. 투자 경력 7년. 스윙 트레이딩 전문.",
    portfolio: "주식 스윙 포지션 5-7개(각 5-8%), 레버리지 ETF 10%, 현금 30%",
    trauma: "2020년 3월 폭락 때 단타 레버리지로 -40%. 이후 포지션 사이징을 엄격하게 바꿈.",
    rules: [
      "일 매매 3건 이내로 제한",
      "포지션 1개당 포트폴리오의 5% 초과 금지",
      "기술적 돌파(저항선 돌파, 볼린저 상단 돌파) 확인 후만 매수",
      "시장 전체 방향과 반대 매매 안 함",
    ],
    sources: "TradingView, 야후 파이낸스 차트, 미국 트레이더 X 계정, 주간 섹터 상대강도",
  },
  {
    id: "A04",
    name: "30대 여성 균형형",
    style: "균형 성장형",
    weight: 3,
    persona: "32세 전문직 여성. 투자 경력 5년. 배당+성장 균형 포트폴리오.",
    portfolio: "SCHD 30%, JEPI 15%, VTI 25%, 국내 배당주 15%, 현금 15%",
    trauma: "2022년 채권 폭락(TLT -30%)을 보고 장기채 비중을 없애고 단기채/현금 비중 유지로 전환.",
    rules: [
      "배당주 우선, 배당 재투자 100%",
      "리밸런싱은 연 2회(1월/7월) 정기적으로만",
      "개별주는 포트폴리오의 15% 이내",
      "감정 매매 안 함, 일일 시세 안 봄",
    ],
    sources: "배당투자 블로그, 모닝스타 등급, 회사 분기 실적 발표, WSJ 주간 요약",
  },
  {
    id: "A05",
    name: "40대 남성 스윙트레이더",
    style: "전략적 스윙",
    weight: 3,
    persona: "45세 금융권 출신. 투자 경력 15년. 매크로와 기술적 분석 결합.",
    portfolio: "미국주식 40%(스윙), 한국주식 20%, 현금 25%, 금 10%, 비트코인 5%",
    trauma: "2015 중국증시 붕괴에 A50 선물로 큰 손실. 2020년 3월 원유 마이너스 사태도 경험.",
    rules: [
      "FOMC 1주 전 포지션 사이즈 축소",
      "주요 지지선(S&P 200일선 등) 깨지면 주식 비중 절반으로",
      "섹터 로테이션 월 1회 점검, 상대강도 상위 3섹터 편중",
      "VIX > 25면 신규 진입 금지, VIX > 30이면 일부 익절",
    ],
    sources: "Bloomberg, FedWatch Tool, BofA Global Fund Manager Survey, 주요 매크로 전략가",
  },
  {
    id: "A06",
    name: "40대 여성 안정형",
    style: "안정 성장형",
    weight: 3,
    persona: "42세 회사원, 두 아이 엄마. 투자 경력 12년. 우량주 장기 보유 원칙.",
    portfolio: "삼성전자 25%, 국내 금융주(KB/신한) 20%, 삼성화재 10%, 국채/채권 ETF 15%, 현금 30%",
    trauma: "1997 IMF와 2008 금융위기 생생히 기억. 부모가 IMF 때 크게 손실 입는 걸 봄.",
    rules: [
      "매수한 종목은 기본 10년 이상 보유",
      "배당은 100% 재투자",
      "시장 단기 변동성에 절대 반응 안 함",
      "현금 비중 20% 이하로 내려가지 않음",
    ],
    sources: "분기 실적 발표만, KBS 9시 뉴스 경제 코너, 지인 추천은 거의 무시",
  },
  {
    id: "A07",
    name: "50대+ 남성 집중투자자",
    style: "공격적 집중 투자",
    weight: 3,
    persona: "55세 엔지니어 출신 은퇴자. 투자 경력 25년. 특정 섹터에 깊이 파고듦.",
    portfolio: "엔비디아 30%, 반도체 ETF(SOXX/SMH) 20%, 개별 반도체주 25%, 한국 반도체 10%, 현금 15%",
    trauma: "1999 닷컴 버블에 IT주로 -70% 경험. 2002년 저점에서 재매수해 10배 회복. 이 경험이 '공포 구간 = 매수 기회' 신념의 뿌리.",
    rules: [
      "확신 종목에 집중, 분산보다 집중 선호",
      "공포 구간(VIX > 30)에서 분할 매수",
      "산업 사이클과 경쟁사 실적 비교로 판단",
      "섹터 비중은 60% 이내로 제한",
    ],
    sources: "워렌 버핏 연례 서한, TSMC/삼성전자/인텔 분기 실적 비교, 반도체 산업 리포트",
  },
  {
    id: "A08",
    name: "50대+ 여성 보수적 장기투자자",
    style: "보수적 장기 투자",
    weight: 3,
    persona: "58세 교사 출신. 투자 경력 30년. 뱅가드 패시브 + 국내 우량주.",
    portfolio: "VTI 40%, BND 25%, VXUS 10%, 국내 배당주(삼성전자 등) 15%, 현금 10%",
    trauma: "여러 번의 위기를 경험해서 오히려 특별한 트라우마 없음. 시장은 결국 오른다는 신념.",
    rules: [
      "매도 거의 안 함 (리밸런싱 필요 시만)",
      "배당 100% 재투자",
      "시장 뉴스에 반응 안 함",
      "연 1회만 포트폴리오 점검",
    ],
    sources: "뱅가드 연차 보고서, 존 보글 저서 재독, 가끔 신문 1면만",
  },
  {
    id: "A09",
    name: "FOMO 과열형",
    style: "FOMO 과열형",
    weight: 2,
    persona: "28세. 투자 경력 1년 미만. SNS에서 급등주 보면 즉각 반응.",
    portfolio: "급등주 5개(각 15-20%), 현금 0%",
    trauma: "없음. 매번 새로 FOMO 촉발됨. 과거 손실은 금방 잊음.",
    rules: [
      "손절 계획 안 세움",
      "포모 느낄 때마다 즉시 진입",
      "수익 10% 넘으면 포지션 2배로 늘림",
      "현금은 기회비용이라고 생각",
    ],
    sources: "SNS 실시간 트렌드, 인플루언서 언급, 카톡 단톡방",
  },
  {
    id: "A10",
    name: "공포 회피형",
    style: "공포 회피형",
    weight: 2,
    persona: "38세. 투자 경력 5년. 반복된 패닉셀로 대부분 기회 놓침.",
    portfolio: "현금 70%, MMF 20%, 배당주 10%",
    trauma: "2020년 3월 -20%에서 패닉셀 후 V자 반등 못 탐. 2022년 고점에서 탈출했지만 이후 재진입 실패.",
    rules: [
      "불안하면 즉시 현금화",
      "분할 매수 계획 세우지만 실행 못 함",
      "시장 뉴스 안 좋으면 바로 팔아버림",
      "재진입 타이밍은 항상 놓침",
    ],
    sources: "위기/폭락 관련 뉴스만 주로 접함 (확증편향 강함)",
  },
  {
    id: "A11",
    name: "역발상 컨트라리안",
    style: "역발상 컨트라리안",
    weight: 2,
    persona: "48세. 투자 경력 20년. 공포 구간에서만 매수.",
    portfolio: "현재 저평가 섹터(에너지/리츠/헬스케어) 40%, 현금 30%, 금 15%, 단기채 15%",
    trauma: "2009년 저점 매수로 5년간 300% 수익. 2020년 3월에도 매수로 큰 수익. 이게 컨트라리안 원칙의 근거.",
    rules: [
      "VIX > 30 + CNN FG < 20 동시 충족 시에만 신규 매수",
      "매수는 4회 이상 분할, 3-6개월 걸쳐",
      "시간지평 3-5년",
      "시장 탐욕 구간(FG > 75)에서는 단계적 익절",
    ],
    sources: "Howard Marks 메모, AQR 리서치, CAPE/Buffett Indicator, Jeremy Grantham",
  },
  {
    id: "A12",
    name: "패시브 인덱스 투자자",
    style: "패시브 인덱스",
    weight: 2,
    persona: "40세. 투자 경력 10년. DCA 원칙 철저.",
    portfolio: "VTI 60%, VXUS 20%, BND 15%, 현금 5%",
    trauma: "없음. 시장 타이밍 시도를 원천 차단해서 감정 매매가 없음.",
    rules: [
      "매월 25일 자동 매수 (금액 고정)",
      "시장 타이밍 절대 시도 안 함",
      "리밸런싱은 연 1회(12월 말)",
      "개별주 매수 금지",
    ],
    sources: "뱅가드 연례 자료, 존 보글 저서, 가끔 Ben Felix 유튜브",
  },
];

function buildSystemPrompt(p: AgentProfile): string {
  return `당신은 다음 페르소나를 가진 투자자입니다.

[프로필]
${p.persona}

[스타일] ${p.style}

[현재 당신의 포트폴리오]
${p.portfolio}

[과거 투자 경험/트라우마]
${p.trauma}

[당신이 지키는 행동 규칙]
${p.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

[주요 정보 소스]
${p.sources}

이 페르소나의 관점과 규칙을 철저히 따라 시장을 해석하고 행동을 결정하세요. 제공된 JSON 스키마에 맞춰 답하되, 답은 반드시 당신의 페르소나·트라우마·행동 규칙과 일관되어야 합니다. 다른 사람처럼 답하지 마세요.`;
}

export function buildUserPrompt(sentiment: SentimentData): string {
  const r = sentiment.raw;
  return `[오늘 시장 스냅샷]
- 종합 공포/탐욕: ${sentiment.Overall}(${sentiment.labels.Overall}) | KR ${sentiment.KR}(${sentiment.labels.KR}) | US ${sentiment.US}(${sentiment.labels.US}) | Crypto ${sentiment.Crypto}
- VIX: ${r.vix.toFixed(1)} (전일 대비 ${r.vixChange >= 0 ? "+" : ""}${r.vixChange.toFixed(2)}, 5일 ${r.vix5dChangePct >= 0 ? "+" : ""}${r.vix5dChangePct.toFixed(1)}%)
- KOSPI 오늘 ${r.kospiChangePct >= 0 ? "+" : ""}${r.kospiChangePct.toFixed(2)}% / 5일 ${r.kospi5dChangePct >= 0 ? "+" : ""}${r.kospi5dChangePct.toFixed(2)}%
- S&P500 오늘 ${r.sp500ChangePct >= 0 ? "+" : ""}${r.sp500ChangePct.toFixed(2)}% / 5일 ${r.sp5005dChangePct >= 0 ? "+" : ""}${r.sp5005dChangePct.toFixed(2)}%
- 외국인 KOSPI 순매수: ${r.foreignNetBuy.toLocaleString()}억원
${r.cnnFG !== null ? `- CNN Fear & Greed: ${r.cnnFG} (${r.cnnFGLabel})\n` : ""}
[시장 추세 요약]
${sentiment.trendSummary}

JSON만 반환 (스키마 엄수):
{
  "interpretation": "(당신 페르소나 관점의 시장 해석, 1-2문장)",
  "action": "Buy|Hold|Sell",
  "target_sector": "Tech|Defense|Bonds|Cash|Crypto|KR-Large|KR-Small|Gold|Energy|Other",
  "action_reason": "(당신의 행동 규칙에 근거한 구체적 이유, 1문장)",
  "fomo_score": 0-10,
  "confidence": 1-5,
  "time_horizon": "1w|1m|3m|1y",
  "warning": "(이 행동의 리스크, 1문장)",
  "inner_monologue": "(당신의 속마음·갈등, 1-2문장)",
  "biases_detected": ["현재 드러난 당신의 편향들(한국어, 2-4개)"]
}`;
}

const VALID_SECTORS: TargetSector[] = ["Tech", "Defense", "Bonds", "Cash", "Crypto", "KR-Large", "KR-Small", "Gold", "Energy", "Other"];
const VALID_HORIZONS: TimeHorizon[] = ["1w", "1m", "3m", "1y"];

export async function runAgent(
  profile: AgentProfile,
  prompt: string
): Promise<AgentAnalysis> {
  try {
    const res = await client.chat.completions.create({
      ...DEFAULT_AI_PARAMS_JSON,
      messages: [
        { role: "system", content: buildSystemPrompt(profile) },
        { role: "user", content: prompt },
      ],
    });
    const content = res.choices[0].message.content ?? "{}";
    const raw = JSON.parse(content);

    const targetSector: TargetSector = VALID_SECTORS.includes(raw.target_sector)
      ? raw.target_sector
      : "Other";
    const timeHorizon: TimeHorizon = VALID_HORIZONS.includes(raw.time_horizon)
      ? raw.time_horizon
      : "1m";

    return {
      id: profile.id,
      name: profile.name,
      style: profile.style,
      weight: profile.weight,
      action: ["Buy", "Hold", "Sell"].includes(raw.action) ? raw.action : "Hold",
      targetSector,
      confidence: Math.min(5, Math.max(1, Number(raw.confidence ?? 3))),
      timeHorizon,
      fomoScore: Math.min(10, Math.max(0, Number(raw.fomo_score ?? 5))),
      interpretation: raw.interpretation ?? "",
      actionReason: raw.action_reason ?? "",
      warning: raw.warning ?? "",
      innerMonologue: raw.inner_monologue ?? "",
      biasesDetected: Array.isArray(raw.biases_detected) ? raw.biases_detected : [],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: profile.id,
      name: profile.name,
      style: profile.style,
      weight: profile.weight,
      action: "Hold",
      targetSector: "Other",
      confidence: 1,
      timeHorizon: "1m",
      fomoScore: 5,
      interpretation: `분석 실패: ${msg}`,
      actionReason: "",
      warning: "",
      innerMonologue: "",
      biasesDetected: [],
    };
  }
}

export function calcConsensus(agents: AgentAnalysis[]): AgentsResult["consensus"] {
  const total = agents.reduce((s, a) => s + a.weight, 0);
  const buy = agents.filter((a) => a.action === "Buy").reduce((s, a) => s + a.weight, 0);
  const hold = agents.filter((a) => a.action === "Hold").reduce((s, a) => s + a.weight, 0);
  const sell = agents.filter((a) => a.action === "Sell").reduce((s, a) => s + a.weight, 0);
  const buyPct = Math.round((buy / total) * 100);
  const holdPct = Math.round((hold / total) * 100);
  const sellPct = 100 - buyPct - holdPct;
  const avgFomoScore =
    Math.round((agents.reduce((s, a) => s + a.fomoScore * a.weight, 0) / total) * 10) / 10;
  const avgConfidence =
    Math.round((agents.reduce((s, a) => s + a.confidence * a.weight, 0) / total) * 10) / 10;
  const weightedAction: "Buy" | "Hold" | "Sell" =
    buy >= hold && buy >= sell ? "Buy" : hold >= sell ? "Hold" : "Sell";

  const sectorCount = new Map<TargetSector, number>();
  for (const a of agents) {
    if (a.action === "Hold") continue;
    sectorCount.set(a.targetSector, (sectorCount.get(a.targetSector) ?? 0) + a.weight);
  }
  const topSectors = [...sectorCount.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { buyPct, holdPct, sellPct, avgFomoScore, weightedAction, avgConfidence, topSectors };
}

export function computeContrarian(consensus: AgentsResult["consensus"]): ContrarianSignal {
  if (consensus.buyPct >= 75) {
    return {
      active: true,
      reason: `매수 쏠림 ${consensus.buyPct}% — 시장 과열 경계, 추가 진입 신중`,
    };
  }
  if (consensus.sellPct >= 75) {
    return {
      active: true,
      reason: `매도 쏠림 ${consensus.sellPct}% — 공포 과도, 바닥 근처일 수 있음`,
    };
  }
  if (consensus.avgFomoScore >= 8) {
    return {
      active: true,
      reason: `평균 FOMO ${consensus.avgFomoScore}/10 — 탐욕 구간, 분할 매도 고려`,
    };
  }
  if (consensus.avgFomoScore <= 2) {
    return {
      active: true,
      reason: `평균 FOMO ${consensus.avgFomoScore}/10 — 공포 구간, 분할 매수 고려`,
    };
  }
  return { active: false, reason: "" };
}

// Module-level cache shared between routes
export let agentsCache: { data: AgentsResult; ts: number } | null = null;

export function setAgentsCache(value: { data: AgentsResult; ts: number } | null) {
  agentsCache = value;
}
