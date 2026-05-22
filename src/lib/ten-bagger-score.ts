import YahooFinance from "yahoo-finance2";
import { isKoreanTicker } from "./ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface TenBaggerResult {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  low52w: number | null;
  high52w: number | null;
  from52wLow: number | null;        // Signal 1: 52주 저점 기준
  localMinPrice: number | null;
  localMinDate: string | null;
  fromLocalMin: number | null;      // Signal 2: 로컬 미니마 기준
  volBasePrice: number | null;
  volBaseDate: string | null;
  fromVolBase: number | null;       // Signal 3: 수급 쏠림 돌파 기준
  volumeRatio: number | null;       // 최근 20일 vs 전체 평균 거래량
  recoveryPct: number | null;       // 52주 저점~고점 내 현재 위치 (%)
  score: number;
  signalsCount: number;             // 2x 이상 신호 개수 (max 3)
  earlyScore: number;               // 초기 셋업 점수 (낮은 배수 + 신선 수급 보상)
  phase: "early" | "breakout" | "momentum";
  sparkline: number[];
}

interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchBars(
  symbol: string,
): Promise<{ bars: DailyBar[]; name: string; currency: string } | null> {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const period1 = oneYearAgo.toISOString().split("T")[0];
    const period2 = new Date().toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [chart, quote]: [any, any] = await Promise.all([
      yf.chart(symbol, { period1, period2, interval: "1d" }).catch(() => null),
      yf.quote(symbol).catch(() => null),
    ]);

    if (!chart?.quotes?.length) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bars: DailyBar[] = chart.quotes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.close != null && q.close > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: q.open ?? q.close,
        high: q.high ?? q.close,
        low: q.low ?? q.close,
        close: q.close as number,
        volume: (q.volume as number) ?? 0,
      }));

    if (bars.length < 50) return null;

    const name = (quote?.longName ?? quote?.shortName ?? symbol) as string;
    const currency = (
      quote?.currency ??
      (symbol.endsWith(".KS") || symbol.endsWith(".KQ") ? "KRW" : "USD")
    ) as string;

    return { bars, name, currency };
  } catch {
    return null;
  }
}

// Signal 1: 52주 저점 대비 현재 상승 배수
function signal52wLow(bars: DailyBar[], currentPrice: number) {
  const lows = bars.map((b) => b.low).filter((v) => v > 0);
  const highs = bars.map((b) => b.high).filter((v) => v > 0);
  if (!lows.length || !highs.length)
    return { low52w: null, high52w: null, from52wLow: null, recoveryPct: null };

  const low52w = Math.min(...lows);
  const high52w = Math.max(...highs);
  const from52wLow = low52w > 0 ? currentPrice / low52w : null;
  const range = high52w - low52w;
  const recoveryPct = range > 0 ? ((currentPrice - low52w) / range) * 100 : null;
  return { low52w, high52w, from52wLow, recoveryPct };
}

// Signal 2: 가장 최근 유의미한 스윙 저점 대비 상승 배수
// 조건: 10봉 내 최저점 + 좌측 고점 대비 15% 이상 하락
function signalLocalMin(bars: DailyBar[], currentPrice: number) {
  if (bars.length < 40)
    return { localMinPrice: null, localMinDate: null, fromLocalMin: null };

  const W = 10;
  const MIN_DROP = 0.15;
  const candidates: { price: number; date: string }[] = [];

  for (let i = W; i < bars.length - W; i++) {
    const bar = bars[i];
    const left = bars.slice(Math.max(0, i - W), i);
    const right = bars.slice(i + 1, i + W + 1);

    if (!left.every((b) => b.low >= bar.low)) continue;
    if (!right.every((b) => b.low >= bar.low)) continue;

    const leftHigh = Math.max(...left.map((b) => b.high));
    const dropDepth = leftHigh > 0 ? (leftHigh - bar.low) / leftHigh : 0;
    if (dropDepth < MIN_DROP) continue;

    candidates.push({ price: bar.low, date: bar.date });
  }

  if (candidates.length === 0)
    return { localMinPrice: null, localMinDate: null, fromLocalMin: null };

  const best = candidates[candidates.length - 1]; // 가장 최근
  const fromLocalMin = best.price > 0 ? currentPrice / best.price : null;
  return { localMinPrice: best.price, localMinDate: best.date, fromLocalMin };
}

// Signal 3: 최초 수급 쏠림(거래량 급등) 돌파일 기준 상승 배수
// 조건: 거래량 전체 평균의 2.5배 이상 + 양봉 (close > open)
function signalVolBase(bars: DailyBar[], currentPrice: number) {
  if (bars.length < 60)
    return {
      volBasePrice: null,
      volBaseDate: null,
      fromVolBase: null,
      volumeRatio: null,
    };

  const allVols = bars.map((b) => b.volume).filter((v) => v > 0);
  const avgVolAll = allVols.reduce((a, b) => a + b, 0) / allVols.length;

  const recent20 = bars.slice(-20).map((b) => b.volume).filter((v) => v > 0);
  const avgVol20 =
    recent20.length > 0
      ? recent20.reduce((a, b) => a + b, 0) / recent20.length
      : avgVolAll;
  const volumeRatio = avgVolAll > 0 ? avgVol20 / avgVolAll : null;

  // 최근 180일 내 첫 번째 매수 수급 급등일
  const lookback = bars.slice(-180);
  for (const bar of lookback) {
    if (
      bar.volume > avgVolAll * 2.5 &&
      bar.close > bar.open &&
      bar.open > 0
    ) {
      const fromVolBase = currentPrice / bar.open;
      return {
        volBasePrice: bar.open,
        volBaseDate: bar.date,
        fromVolBase,
        volumeRatio,
      };
    }
  }

  // fallback: 3일 연속 평균 1.5배 초과 구간의 시작
  for (let i = 0; i < lookback.length - 2; i++) {
    const three = lookback.slice(i, i + 3);
    if (three.every((b) => b.volume > avgVolAll * 1.5 && b.close > 0)) {
      const bar = lookback[i];
      const fromVolBase = bar.open > 0 ? currentPrice / bar.open : null;
      return {
        volBasePrice: bar.open,
        volBaseDate: bar.date,
        fromVolBase,
        volumeRatio,
      };
    }
  }

  return { volBasePrice: null, volBaseDate: null, fromVolBase: null, volumeRatio };
}

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// 현재가가 여정의 어느 단계인지 분류
// early:     아직 저점 근처 (진입 기회)
// breakout:  이탈 진행 중 (모멘텀 초입)
// momentum:  이미 크게 오름 (추격 주의)
function classifyPhase(
  from52wLow: number | null,
  recoveryPct: number | null,
): "early" | "breakout" | "momentum" {
  const multi = from52wLow ?? 1.0;
  const pct   = recoveryPct ?? 50;
  if (multi >= 3.0 || pct >= 78) return "momentum";
  if (multi <= 1.5 && pct < 50)  return "early";
  return "breakout";
}

// 초기 셋업 점수: 아직 안 올랐지만 수급이 들어오기 시작한 종목에 높은 점수
// 배수가 낮을수록 + 수급이 신선할수록 + 위치가 낮을수록 유리
function computeEarlyScore(params: {
  from52wLow: number | null;
  volumeRatio: number | null;
  recoveryPct: number | null;
  volBaseDate: string | null;
}): number {
  const { from52wLow, volumeRatio, recoveryPct, volBaseDate } = params;
  let score = 0;

  // 1. 저점 근접도 — 낮을수록 아직 초기 (max 30)
  if (from52wLow != null) {
    if (from52wLow < 1.15)      score += 30;
    else if (from52wLow < 1.30) score += 24;
    else if (from52wLow < 1.50) score += 15;
    else if (from52wLow < 2.00) score += 5;
    // >= 2x: 이미 많이 올랐으므로 0점
  }

  // 2. 수급 신선도 — 최근에 들어온 수급일수록 좋음 (max 30)
  const days = daysAgo(volBaseDate);
  if (days <= 20)      score += 30;
  else if (days <= 45) score += 22;
  else if (days <= 90) score += 12;

  // 3. 거래량 빌드업 — 적당히 오르는 중이 최고; 이미 폭발한 건 감점 (max 20)
  if (volumeRatio != null) {
    if (volumeRatio >= 1.5 && volumeRatio < 3.0) score += 20; // 축적 단계
    else if (volumeRatio >= 1.2)                  score += 12; // 시작 단계
    else if (volumeRatio >= 3.0)                  score += 6;  // 이미 폭발 = 늦었을 수도
  }

  // 4. 52주 위치 스위트스팟 — 하단 탈출 초입 (max 20)
  if (recoveryPct != null) {
    if (recoveryPct >= 12 && recoveryPct <= 45) score += 20;
    else if (recoveryPct >= 6 && recoveryPct <= 58) score += 10;
    else if (recoveryPct >= 58 && recoveryPct <= 70) score += 4;
  }

  return Math.min(score, 100);
}

function computeScore(params: {
  from52wLow: number | null;
  fromLocalMin: number | null;
  fromVolBase: number | null;
  volumeRatio: number | null;
  recoveryPct: number | null;
}): { score: number; signalsCount: number } {
  const { from52wLow, fromLocalMin, fromVolBase, volumeRatio, recoveryPct } = params;

  const signalsCount = [from52wLow, fromLocalMin, fromVolBase].filter(
    (v): v is number => v != null && v >= 2.0,
  ).length;

  let score = 0;

  // 1. 2x 이상 신호 개수 (max 30)
  score += signalsCount * 10;

  // 2. 최고 배수 강도 (max 30)
  const multiples = [from52wLow, fromLocalMin, fromVolBase].filter(
    (v): v is number => v != null && v >= 1.5,
  );
  if (multiples.length > 0) {
    const best = Math.max(...multiples);
    if (best >= 5) score += 30;
    else if (best >= 3) score += 25;
    else if (best >= 2) score += 20;
    else score += 10;
  }

  // 3. 수급 강도 (max 20)
  if (volumeRatio != null) {
    if (volumeRatio >= 2.0) score += 20;
    else if (volumeRatio >= 1.5) score += 15;
    else if (volumeRatio >= 1.3) score += 10;
    else if (volumeRatio >= 1.1) score += 5;
  }

  // 4. 52주 범위 내 위치 (sweet spot 50~85%) (max 20)
  if (recoveryPct != null) {
    if (recoveryPct >= 50 && recoveryPct <= 85) score += 20;
    else if (recoveryPct >= 40 && recoveryPct <= 90) score += 10;
    else score += 5;
  }

  return { score: Math.min(score, 100), signalsCount };
}

export async function scoreTenBagger(ticker: string): Promise<TenBaggerResult | null> {
  let data: { bars: DailyBar[]; name: string; currency: string } | null = null;

  if (isKoreanTicker(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      data = await fetchBars(`${ticker}${suffix}`);
      if (data) break;
    }
  } else {
    data = await fetchBars(ticker);
  }

  if (!data) return null;
  const { bars, name, currency } = data;

  const currentPrice = bars[bars.length - 1].close;
  if (currentPrice <= 0) return null;

  const sig1 = signal52wLow(bars, currentPrice);
  const sig2 = signalLocalMin(bars, currentPrice);
  const sig3 = signalVolBase(bars, currentPrice);

  // 최소 조건: 신호 1개 이상이 1.5x 이상
  const maxMultiple = Math.max(
    sig1.from52wLow ?? 0,
    sig2.fromLocalMin ?? 0,
    sig3.fromVolBase ?? 0,
  );
  if (maxMultiple < 1.5) return null;

  const { score, signalsCount } = computeScore({
    from52wLow: sig1.from52wLow,
    fromLocalMin: sig2.fromLocalMin,
    fromVolBase: sig3.fromVolBase,
    volumeRatio: sig3.volumeRatio,
    recoveryPct: sig1.recoveryPct,
  });

  const earlyScore = computeEarlyScore({
    from52wLow: sig1.from52wLow,
    volumeRatio: sig3.volumeRatio,
    recoveryPct: sig1.recoveryPct,
    volBaseDate: sig3.volBaseDate,
  });

  const phase = classifyPhase(sig1.from52wLow, sig1.recoveryPct);

  const sparkline = bars.slice(-90).map((b) => b.close);

  return {
    ticker,
    name,
    currency,
    price: currentPrice,
    low52w: sig1.low52w,
    high52w: sig1.high52w,
    from52wLow: sig1.from52wLow,
    localMinPrice: sig2.localMinPrice,
    localMinDate: sig2.localMinDate,
    fromLocalMin: sig2.fromLocalMin,
    volBasePrice: sig3.volBasePrice,
    volBaseDate: sig3.volBaseDate,
    fromVolBase: sig3.fromVolBase,
    volumeRatio: sig3.volumeRatio,
    recoveryPct: sig1.recoveryPct,
    score,
    signalsCount,
    earlyScore,
    phase,
    sparkline,
  };
}
