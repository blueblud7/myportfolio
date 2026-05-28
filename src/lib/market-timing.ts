// 시장 심리(VIX/CNN F&G) 기반 백테스트 라이브러리

export type Indicator = "vix" | "fng";
export type Direction = "below" | "above";
export type IndexSymbol = "sp500" | "kospi" | "nasdaq";

export interface DailyPoint {
  date: string;     // YYYY-MM-DD
  close: number;
}
export interface IndicatorPoint {
  date: string;
  value: number;
  rating?: string;  // F&G의 경우
}

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
};
const CNN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://edition.cnn.com/",
  "Origin": "https://edition.cnn.com",
  "Accept-Language": "en-US,en;q=0.9",
};

export const INDEX_SYMBOLS: Record<IndexSymbol, { symbol: string; label: string }> = {
  sp500:  { symbol: "^GSPC", label: "S&P 500" },
  kospi:  { symbol: "^KS11", label: "KOSPI" },
  nasdaq: { symbol: "^IXIC", label: "NASDAQ" },
};

function tsToDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ─── Yahoo Finance: 인덱스/VIX 일봉 데이터 ─────────────────────────────────────
export async function fetchYahooDaily(symbol: string, years = 5): Promise<DailyPoint[]> {
  const range = years >= 10 ? "10y" : years >= 5 ? "5y" : years >= 2 ? "2y" : "1y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 6 * 60 * 60 } });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const json = await res.json() as {
    chart?: { result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }> };
  };
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp) return [];
  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: DailyPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (typeof c !== "number" || !isFinite(c)) continue;
    points.push({ date: tsToDate(timestamps[i] * 1000), close: c });
  }
  return points;
}

// ─── CNN Fear & Greed Index: 1년치 역사 데이터 ─────────────────────────────────
export async function fetchCnnFearGreedHistorical(): Promise<IndicatorPoint[]> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      { headers: CNN_HEADERS, next: { revalidate: 60 * 60 } }
    );
    if (!res.ok) return [];
    const json = await res.json() as {
      fear_and_greed_historical?: { data?: Array<{ x: number; y: number; rating?: string }> };
    };
    const data = json?.fear_and_greed_historical?.data ?? [];
    return data.map(d => ({
      date: tsToDate(d.x),
      value: Math.round(d.y),
      rating: d.rating,
    }));
  } catch {
    return [];
  }
}

// ─── 알려진 주요 시장 이벤트 (한국 투자자 관점) ────────────────────────────────
export interface MarketEvent {
  date: string;
  title: string;
  summary: string;
  category: "crisis" | "rally" | "policy" | "geopolitics";
}

export const KNOWN_EVENTS: MarketEvent[] = [
  // 2020 코로나
  { date: "2020-02-19", title: "코로나 직전 고점", summary: "S&P500 사상 최고가, 며칠 후 폭락 시작", category: "rally" },
  { date: "2020-03-09", title: "원유 가격 전쟁", summary: "사우디-러시아 증산 전쟁, 유가 -25%", category: "crisis" },
  { date: "2020-03-12", title: "WHO 팬데믹 선언", summary: "S&P500 -9.5% 블랙 목요일", category: "crisis" },
  { date: "2020-03-16", title: "VIX 최고치", summary: "VIX 82.69 사상 최고, 시장 -12%", category: "crisis" },
  { date: "2020-03-23", title: "Fed 무제한 QE", summary: "코로나 저점, S&P500 2237 (이후 6년간 강세장 시작)", category: "policy" },
  { date: "2020-11-09", title: "화이자 백신 발표", summary: "백신 90% 효과 발표, 시장 급반등", category: "rally" },

  // 2021 회복
  { date: "2021-01-06", title: "민주당 상원 장악", summary: "조지아 결선, 부양책 기대 랠리", category: "policy" },
  { date: "2021-11-26", title: "오미크론 변종", summary: "VIX 28까지 급등, S&P500 -2.3%", category: "crisis" },

  // 2022 베어마켓
  { date: "2022-01-03", title: "2022 시장 고점", summary: "S&P500 4796 사상 최고, 이후 1년 베어마켓 시작", category: "rally" },
  { date: "2022-02-24", title: "러시아 우크라이나 침공", summary: "전쟁 개시, 에너지 가격 급등", category: "geopolitics" },
  { date: "2022-03-16", title: "Fed 첫 금리 인상", summary: "+25bp, 22년 만의 인상 사이클 시작", category: "policy" },
  { date: "2022-06-13", title: "5월 CPI 충격", summary: "8.6% 발표, S&P500 -3.9%", category: "crisis" },
  { date: "2022-06-16", title: "Fed 75bp 인상", summary: "1994년 이후 최대폭, S&P500 베어마켓 1차 저점", category: "policy" },
  { date: "2022-09-13", title: "8월 CPI 충격", summary: "8.3%, S&P500 -4.3% 폭락", category: "crisis" },
  { date: "2022-10-12", title: "베어마켓 저점", summary: "S&P500 3491, 1년 누적 -25%", category: "crisis" },
  { date: "2022-11-10", title: "CPI 둔화 확인", summary: "7.7% 하회, S&P500 +5.5% 랠리", category: "rally" },

  // 2023
  { date: "2023-03-10", title: "SVB 파산", summary: "실리콘밸리은행 뱅크런, 은행주 폭락", category: "crisis" },
  { date: "2023-10-27", title: "10년물 5%", summary: "금리 정점 우려, S&P500 4117 저점", category: "crisis" },

  // 2024
  { date: "2024-08-05", title: "엔케리 청산 블랙먼데이", summary: "BOJ 금리 인상, 닛케이 -12%, 글로벌 패닉", category: "crisis" },
  { date: "2024-09-18", title: "Fed 50bp 인하 시작", summary: "4년 만에 첫 인하, 50bp 깜짝", category: "policy" },
  { date: "2024-11-06", title: "트럼프 당선", summary: "S&P500 +2.5% 랠리, 비트코인 신고가", category: "rally" },

  // 2025
  { date: "2025-04-02", title: "트럼프 상호관세 발표", summary: "전국가 10% + 차등 관세 발표, 글로벌 패닉 시작", category: "geopolitics" },
  { date: "2025-04-08", title: "관세 패닉 저점", summary: "S&P500 -12% (3일), VIX 60+", category: "crisis" },
  { date: "2025-04-09", title: "90일 관세 유예", summary: "트럼프 90일 유예 발표, S&P500 +9.5% 사상 최대 일일 상승", category: "policy" },
  { date: "2025-05-12", title: "미중 관세 유예", summary: "90일 휴전 합의, S&P500 +3.3%", category: "policy" },
];

// 진입 시점에 매칭되는 이벤트 찾기 (±7일 이내)
export function findNearbyEvent(date: string, days = 7): MarketEvent | null {
  const target = new Date(date).getTime();
  for (const e of KNOWN_EVENTS) {
    const diff = Math.abs(new Date(e.date).getTime() - target);
    if (diff <= days * 24 * 60 * 60 * 1000) return e;
  }
  return null;
}

// ─── 백테스트 ────────────────────────────────────────────────────────────────
export interface BacktestEntry {
  date: string;
  indicatorValue: number;
  rating?: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  event?: MarketEvent;
}
export interface BacktestStats {
  count: number;
  avgReturn: number;
  median: number;
  winRate: number;
  best: number;
  worst: number;
  stdDev: number;
  positiveCount: number;
  negativeCount: number;
}

export interface BacktestParams {
  indicator: IndicatorPoint[];
  index: DailyPoint[];
  direction: Direction;
  threshold: number;
  holdDays: number;
  cooldownDays?: number;   // 재진입 간격
}

export function runBacktest({ indicator, index, direction, threshold, holdDays, cooldownDays = 30 }: BacktestParams): {
  entries: BacktestEntry[];
  stats: BacktestStats;
} {
  // 날짜 매핑: index의 close lookup
  const indexMap = new Map<string, number>();
  const indexDates: string[] = [];
  for (const p of index) {
    indexMap.set(p.date, p.close);
    indexDates.push(p.date);
  }
  indexDates.sort();

  const findIndexClose = (date: string): { date: string; close: number } | null => {
    // 정확 일치 우선, 없으면 다음 거래일
    if (indexMap.has(date)) return { date, close: indexMap.get(date)! };
    let lo = 0, hi = indexDates.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (indexDates[mid] < date) lo = mid + 1;
      else hi = mid - 1;
    }
    const next = indexDates[lo];
    if (!next) return null;
    return { date: next, close: indexMap.get(next)! };
  };

  const findIndexCloseAfter = (date: string, days: number): { date: string; close: number } | null => {
    const targetDate = new Date(date);
    targetDate.setDate(targetDate.getDate() + days);
    const target = targetDate.toISOString().slice(0, 10);
    return findIndexClose(target);
  };

  // 정렬된 indicator (날짜 오름차순)
  const sortedInd = [...indicator].sort((a, b) => a.date.localeCompare(b.date));

  const entries: BacktestEntry[] = [];
  let lastEntryTs = -Infinity;

  for (const ind of sortedInd) {
    const condition = direction === "above" ? ind.value >= threshold : ind.value <= threshold;
    if (!condition) continue;

    const ts = new Date(ind.date).getTime();
    if (ts - lastEntryTs < cooldownDays * 24 * 60 * 60 * 1000) continue;

    const entry = findIndexClose(ind.date);
    if (!entry) continue;
    const exit = findIndexCloseAfter(entry.date, holdDays);
    if (!exit) continue;

    const returnPct = ((exit.close - entry.close) / entry.close) * 100;
    entries.push({
      date: entry.date,
      indicatorValue: ind.value,
      rating: ind.rating,
      entryPrice: entry.close,
      exitDate: exit.date,
      exitPrice: exit.close,
      returnPct,
      event: findNearbyEvent(ind.date) ?? undefined,
    });
    lastEntryTs = ts;
  }

  const returns = entries.map(e => e.returnPct);
  const n = returns.length;
  if (n === 0) {
    return {
      entries,
      stats: { count: 0, avgReturn: 0, median: 0, winRate: 0, best: 0, worst: 0, stdDev: 0, positiveCount: 0, negativeCount: 0 },
    };
  }
  const avg = returns.reduce((s, v) => s + v, 0) / n;
  const sorted = [...returns].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const best = sorted[sorted.length - 1];
  const worst = sorted[0];
  const positive = returns.filter(r => r > 0).length;
  const negative = returns.filter(r => r < 0).length;
  const variance = returns.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    entries,
    stats: { count: n, avgReturn: avg, median, winRate: (positive / n) * 100, best, worst, stdDev, positiveCount: positive, negativeCount: negative },
  };
}
