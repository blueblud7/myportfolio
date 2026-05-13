import { NextRequest, NextResponse } from "next/server";
import { getBenchmarkHistory } from "@/lib/yahoo-finance";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 60;

const CACHE_TTL = 60 * 60 * 1000; // 1시간

function normalize(prices: number[]): number[] {
  const base = prices[0];
  return prices.map((p) => ((p - base) / base) * 100);
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  const num = a.reduce((s, v, i) => s + (v - meanA) * (b[i] - meanB), 0);
  const denA = Math.sqrt(a.reduce((s, v) => s + (v - meanA) ** 2, 0));
  const denB = Math.sqrt(b.reduce((s, v) => s + (v - meanB) ** 2, 0));
  return denA * denB === 0 ? 0 : num / (denA * denB);
}

export interface PatternMatch {
  startDate: string;
  endDate: string;
  correlation: number;        // -1 ~ 1, 높을수록 유사
  similarityPct: number;      // 0 ~ 100 표시용
  windowNorm: number[];       // 비교 구간 정규화 수익률
  forwardNorm: number[];      // 이후 구간 수익률 (시작점 0 기준)
  forwardReturn: number;      // 이후 구간 최종 수익률 %
  peakReturn: number;         // 이후 구간 최고 수익률 %
  troughReturn: number;       // 이후 구간 최저 수익률 %
}

export interface PatternMatchResponse {
  symbol: string;
  displayName: string;
  lookback: number;
  forward: number;
  currentDates: string[];
  currentNorm: number[];
  matches: PatternMatch[];
  avgForwardReturn: number;
  bullishCount: number;       // forward > 0 인 케이스 수
  date: string;
}

const SYMBOL_NAMES: Record<string, string> = {
  "^IXIC":   "NASDAQ",
  "^GSPC":   "S&P 500",
  "^KS11":   "KOSPI",
  "^KQ11":   "KOSDAQ",
  "^DJI":    "Dow Jones",
  "^N225":   "Nikkei 225",
  "^HSI":    "Hang Seng",
  "^FTSE":   "FTSE 100",
  "GC=F":    "Gold",
  "BTC-USD": "Bitcoin",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol    = searchParams.get("symbol")   ?? "^IXIC";
  const lookback  = Math.max(20, Math.min(500, parseInt(searchParams.get("lookback")  ?? "60")));
  const forward   = Math.max(30, Math.min(3650, parseInt(searchParams.get("forward")  ?? "365")));
  const topK      = Math.max(3,  Math.min(10,  parseInt(searchParams.get("topK")      ?? "5")));

  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `pattern-match:${symbol}:${lookback}:${forward}:${topK}:${today}`;
  const cached = await getStockCache<PatternMatchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // 30년 데이터 fetch (긴 예측 기간 지원)
  const endDate   = today;
  const startDate = new Date(Date.now() - 30 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const history   = await getBenchmarkHistory(symbol, startDate, endDate);

  const minRequired = lookback + forward + 60;
  if (history.length < minRequired) {
    return NextResponse.json({ error: `데이터가 부족합니다 (${history.length}일, 최소 ${minRequired}일 필요)` }, { status: 400 });
  }

  const prices = history.map((h) => h.close);
  const dates  = history.map((h) => h.date);

  // 현재 패턴 (최근 lookback 일)
  const currentPrices = prices.slice(-lookback);
  const currentDates  = dates.slice(-lookback);
  const currentNorm   = normalize(currentPrices);

  // 히스토리 전체 스캔 (현재 구간과 겹치지 않도록 충분한 여백 확보)
  const matches: PatternMatch[] = [];
  const maxStartIdx = prices.length - lookback - forward - 5;

  for (let i = 0; i <= maxStartIdx; i++) {
    const windowPrices  = prices.slice(i, i + lookback);
    const windowNorm    = normalize(windowPrices);
    const corr          = pearsonCorrelation(currentNorm, windowNorm);
    if (corr < 0.7) continue; // 상관계수 0.7 미만은 조기 필터링

    const forwardPrices = prices.slice(i + lookback, i + lookback + forward);
    if (forwardPrices.length < forward) continue;

    const base         = windowPrices[windowPrices.length - 1];
    const forwardNorm  = forwardPrices.map((p) => ((p - base) / base) * 100);
    const forwardReturn = forwardNorm[forwardNorm.length - 1];
    const peakReturn    = Math.max(...forwardNorm);
    const troughReturn  = Math.min(...forwardNorm);

    matches.push({
      startDate:     dates[i],
      endDate:       dates[i + lookback - 1],
      correlation:   corr,
      similarityPct: Math.round(corr * 100),
      windowNorm,
      forwardNorm,
      forwardReturn,
      peakReturn,
      troughReturn,
    });
  }

  // 상관계수 내림차순 정렬, 서로 90일 이상 겹치지 않는 상위 K개 선택
  matches.sort((a, b) => b.correlation - a.correlation);
  const selected: PatternMatch[] = [];
  for (const m of matches) {
    const minGap = Math.max(90, lookback);
    const overlap = selected.some((s) => {
      const diff = Math.abs(new Date(m.startDate).getTime() - new Date(s.startDate).getTime());
      return diff < minGap * 24 * 60 * 60 * 1000;
    });
    if (!overlap) selected.push(m);
    if (selected.length >= topK) break;
  }

  const avgForwardReturn = selected.length
    ? selected.reduce((s, m) => s + m.forwardReturn, 0) / selected.length
    : 0;
  const bullishCount = selected.filter((m) => m.forwardReturn > 0).length;

  const result: PatternMatchResponse = {
    symbol,
    displayName: SYMBOL_NAMES[symbol] ?? symbol,
    lookback,
    forward,
    currentDates,
    currentNorm,
    matches: selected,
    avgForwardReturn,
    bullishCount,
    date: today,
  };

  await setStockCache(cacheKey, result, CACHE_TTL);
  return NextResponse.json(result);
}
