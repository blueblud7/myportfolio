import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyBar {
  date: string;
  close: number;
}

export interface HistoricalEvent {
  id: string;
  name: string;
  nameEn: string;
  type: "경제위기" | "지정학" | "팬데믹" | "시장충격";
  start: string;
  end: string;
  description: string;
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  { id: "dotcom",    name: "닷컴 버블 붕괴",    nameEn: "Dot-com Crash",        type: "경제위기", start: "2000-03-01", end: "2002-10-31", description: "나스닥 -78% 대폭락, IT버블 붕괴" },
  { id: "sep11",     name: "9.11 테러",         nameEn: "9/11 Terror",          type: "지정학",  start: "2001-09-07", end: "2001-09-28", description: "미국 테러공격, 시장 즉각 폐장 후 급락" },
  { id: "gfc",       name: "글로벌 금융위기",    nameEn: "Global Financial Crisis", type: "경제위기", start: "2008-09-01", end: "2009-03-31", description: "리먼 브라더스 파산, S&P500 -57%" },
  { id: "flash10",   name: "2010 플래시 크래시", nameEn: "Flash Crash 2010",     type: "시장충격", start: "2010-05-01", end: "2010-07-01", description: "알고리즘 트레이딩으로 20분간 급락" },
  { id: "eudebt11",  name: "유럽 재정위기",      nameEn: "EU Debt Crisis",       type: "경제위기", start: "2011-07-01", end: "2011-10-31", description: "그리스·이탈리아 국가부채 위기" },
  { id: "china15",   name: "중국 증시 폭락",     nameEn: "China Market Crash",   type: "시장충격", start: "2015-06-15", end: "2015-09-30", description: "상해지수 -45%, 글로벌 연쇄 하락" },
  { id: "q418",      name: "2018 Q4 급락",      nameEn: "Q4 2018 Selloff",      type: "시장충격", start: "2018-10-01", end: "2018-12-31", description: "미중 무역전쟁·금리인상 공포로 S&P -20%" },
  { id: "covid",     name: "코로나19 팬데믹",    nameEn: "COVID-19 Crash",       type: "팬데믹",  start: "2020-02-01", end: "2020-04-30", description: "글로벌 팬데믹 선언, 역사상 가장 빠른 -34%" },
  { id: "ukraine",   name: "러시아-우크라이나",   nameEn: "Russia-Ukraine War",   type: "지정학",  start: "2022-02-24", end: "2022-04-30", description: "러시아 우크라이나 침공, 원자재 급등" },
  { id: "bear22",    name: "2022 금리 베어장",   nameEn: "2022 Rate Bear",       type: "경제위기", start: "2022-01-01", end: "2022-10-31", description: "Fed 급격한 금리인상, QQQ -40%" },
  { id: "svb23",     name: "SVB 은행 파산",      nameEn: "SVB Collapse",         type: "시장충격", start: "2023-03-08", end: "2023-04-30", description: "실리콘밸리 은행 파산, 금융시스템 우려" },
  { id: "yencarry",  name: "2024 엔캐리 청산",   nameEn: "Yen Carry Unwind",     type: "시장충격", start: "2024-07-11", end: "2024-08-15", description: "일본 금리인상·엔캐리 청산으로 급락" },
];

export interface PortfolioResult {
  id: string;
  name: string;
  riskLevel: "low" | "medium" | "high" | "extreme";
  weights: Record<string, number>;
  tickers: string[];
  actualStart: string;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  volatility: number;
  calmar: number;
  maxRecoveryWeeks: number;
  score: number;
  rank: number;
  crisis2020: number;
  crisis2022: number;
  // New fields
  eventDrawdowns: { eventId: string; drawdown: number | null }[];
  mddPercentile: number;   // 0~100: 100이면 역대 최악 수준 하락
  equityCurve: { date: string; value: number }[];
  yearlyReturns: { year: number; return: number }[];
}

// ─── Portfolio Definitions ────────────────────────────────────────────────────

interface PortfolioDef {
  id: string;
  name: string;
  weights: Record<string, number>;
  riskLevel: "low" | "medium" | "high" | "extreme";
}

const PORTFOLIOS: PortfolioDef[] = [
  { id: "qqq100",       name: "QQQ 단독",         weights: { QQQ: 1.0 },                                   riskLevel: "high" as const },
  { id: "voo100",       name: "VOO 단독",         weights: { VOO: 1.0 },                                   riskLevel: "medium" as const },
  { id: "spy100",       name: "SPY 단독",         weights: { SPY: 1.0 },                                   riskLevel: "medium" as const },
  { id: "tqqq100",      name: "TQQQ 단독",        weights: { TQQQ: 1.0 },                                  riskLevel: "extreme" as const },
  { id: "classic6040",  name: "클래식 60/40",      weights: { SPY: 0.6, BND: 0.4 },                         riskLevel: "low" as const },
  { id: "growth6040",   name: "성장 60/40",        weights: { QQQ: 0.6, BND: 0.4 },                         riskLevel: "medium" as const },
  { id: "allweather",   name: "올웨더",            weights: { SPY: 0.3, TLT: 0.4, BND: 0.15, GLD: 0.15 },  riskLevel: "low" as const },
  { id: "goldtri",      name: "황금삼각형",         weights: { QQQ: 0.6, GLD: 0.2, TLT: 0.2 },              riskLevel: "medium" as const },
  { id: "safelev",      name: "안전 레버리지",       weights: { QQQ: 0.5, QLD: 0.3, BND: 0.2 },              riskLevel: "high" as const },
  { id: "aglev",        name: "공격 레버리지",       weights: { TQQQ: 0.4, QQQ: 0.4, BND: 0.2 },             riskLevel: "extreme" as const },
  { id: "hedgelev",     name: "레버리지 헤지",       weights: { UPRO: 0.55, TLT: 0.45 },                      riskLevel: "high" as const },
  { id: "goldhedge",    name: "금 헤지",           weights: { QQQ: 0.8, GLD: 0.2 },                         riskLevel: "high" as const },
  { id: "bondmix",      name: "채권 혼합",          weights: { QQQ: 0.7, TLT: 0.3 },                         riskLevel: "medium" as const },
  { id: "balancedlev",  name: "균형 레버리지",       weights: { QQQ: 0.34, QLD: 0.33, BND: 0.33 },           riskLevel: "high" as const },
  { id: "semimix",      name: "반도체 강화",         weights: { QQQ: 0.5, SOXL: 0.3, BND: 0.2 },             riskLevel: "extreme" as const },
  { id: "intlmix",      name: "글로벌 성장",         weights: { QQQ: 0.5, VOO: 0.3, KORU: 0.2 },             riskLevel: "high" as const },
  { id: "conservative", name: "보수 성장",          weights: { VOO: 0.4, BND: 0.4, GLD: 0.2 },              riskLevel: "low" as const },
  { id: "hybrid",       name: "하이브리드",          weights: { VOO: 0.5, TQQQ: 0.25, TLT: 0.25 },           riskLevel: "high" as const },
  { id: "tqqq_bond",    name: "TQQQ+채권",         weights: { TQQQ: 0.5, BND: 0.3, GLD: 0.2 },             riskLevel: "high" as const },
  { id: "momentum",     name: "모멘텀 혼합",         weights: { QQQ: 0.4, TQQQ: 0.2, UPRO: 0.2, GLD: 0.2 }, riskLevel: "extreme" as const },
];

// ─── Period helpers ───────────────────────────────────────────────────────────

function getPeriodStart(period: string): string {
  const d = new Date();
  switch (period) {
    case "1y":  d.setFullYear(d.getFullYear() - 1); break;
    case "3y":  d.setFullYear(d.getFullYear() - 3); break;
    case "5y":  d.setFullYear(d.getFullYear() - 5); break;
    case "10y": d.setFullYear(d.getFullYear() - 10); break;
    case "20y": d.setFullYear(d.getFullYear() - 20); break;
    default:    return "2000-01-01";
  }
  return d.toISOString().slice(0, 10);
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchWeekly(ticker: string, start: string, end: string): Promise<WeeklyBar[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.chart(ticker, { period1: start, period2: end, interval: "1wk" });
    const quotes = result?.quotes ?? [];
    if (!quotes || quotes.length < 20) return null;
    return quotes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.close != null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        date: typeof r.date === "string" ? r.date : r.date.toISOString().slice(0, 10),
        close: r.adjclose ?? r.adjClose ?? r.close,
      }));
  } catch {
    return null;
  }
}

// ─── Crisis drawdown helper ───────────────────────────────────────────────────

function calcCrisisDrawdown(
  curve: { date: string; value: number }[],
  crisisStart: string,
  crisisEnd: string
): number {
  const window = curve.filter(p => p.date >= crisisStart && p.date <= crisisEnd);
  if (window.length < 2) return 0;

  let peak = window[0].value;
  let maxDd = 0;
  for (const pt of window) {
    if (pt.value > peak) peak = pt.value;
    const dd = ((pt.value - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 100) / 100;
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

function backtest(
  tickerBars: Record<string, WeeklyBar[]>,
  weights: Record<string, number>,
  initialCash: number
): { equityCurve: { date: string; value: number }[]; yearlyReturns: { year: number; return: number }[] } | null {
  const tickers = Object.keys(weights);

  // Build date map per ticker
  const dateMaps: Record<string, Map<string, number>> = {};
  for (const t of tickers) {
    dateMaps[t] = new Map(tickerBars[t].map(b => [b.date, b.close]));
  }

  // Find common dates across all tickers
  const allDateSets = tickers.map(t => new Set(tickerBars[t].map(b => b.date)));
  const commonDates = [...allDateSets[0]]
    .filter(d => allDateSets.every(s => s.has(d)))
    .sort();

  if (commonDates.length < 52) return null;

  // Shares per ticker
  const shares: Record<string, number> = {};
  for (const t of tickers) shares[t] = 0;

  // Initial buy
  for (const t of tickers) {
    const price = dateMaps[t].get(commonDates[0])!;
    shares[t] = (initialCash * weights[t]) / price;
  }

  const equityCurve: { date: string; value: number }[] = [];

  for (let i = 0; i < commonDates.length; i++) {
    const date = commonDates[i];

    // Monthly rebalance every 4 weeks (not on first week)
    if (i > 0 && i % 4 === 0) {
      // Compute total portfolio value
      let totalVal = 0;
      for (const t of tickers) {
        const price = dateMaps[t].get(date)!;
        totalVal += shares[t] * price;
      }
      // Rebalance to target weights
      for (const t of tickers) {
        const price = dateMaps[t].get(date)!;
        shares[t] = (totalVal * weights[t]) / price;
      }
    }

    // Portfolio value this week
    let value = 0;
    for (const t of tickers) {
      const price = dateMaps[t].get(date)!;
      value += shares[t] * price;
    }

    equityCurve.push({ date, value: Math.round(value * 100) / 100 });
  }

  // Yearly returns
  const yearMap: Record<number, { start: number; end: number }> = {};
  for (const pt of equityCurve) {
    const y = parseInt(pt.date.slice(0, 4));
    if (!yearMap[y]) yearMap[y] = { start: pt.value, end: pt.value };
    yearMap[y].end = pt.value;
  }
  const yearlyReturns = Object.entries(yearMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([y, { start, end }]) => ({
      year: parseInt(y),
      return: Math.round(((end - start) / start) * 1000) / 10,
    }));

  return { equityCurve, yearlyReturns };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function calcMetrics(curve: { date: string; value: number }[], initialCash: number) {
  if (curve.length < 2) return { totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0, volatility: 0, calmar: 0, maxRecoveryWeeks: 0 };

  const finalVal = curve[curve.length - 1].value;
  const totalReturn = ((finalVal - initialCash) / initialCash) * 100;

  const days = Math.max(1,
    (new Date(curve[curve.length - 1].date).getTime() - new Date(curve[0].date).getTime()) / 86400000
  );
  const cagr = ((finalVal / initialCash) ** (365 / days) - 1) * 100;

  // MDD and max recovery weeks
  let peak = curve[0].value;
  let mdd = 0;
  let peakIdx = 0;
  let maxRecoveryWeeks = 0;
  let inDrawdown = false;
  let drawdownStart = 0;

  for (let i = 0; i < curve.length; i++) {
    const pt = curve[i];
    if (pt.value > peak) {
      // New peak — if we were in drawdown, check recovery duration
      if (inDrawdown) {
        const recoveryWeeks = i - drawdownStart;
        if (recoveryWeeks > maxRecoveryWeeks) maxRecoveryWeeks = recoveryWeeks;
        inDrawdown = false;
      }
      peak = pt.value;
      peakIdx = i;
    }
    const dd = ((peak - pt.value) / peak) * 100;
    if (dd > mdd) {
      mdd = dd;
      if (!inDrawdown) {
        inDrawdown = true;
        drawdownStart = peakIdx;
      }
    }
  }

  // Weekly returns for Sharpe & Volatility
  const weekly: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].value;
    if (prev > 0) weekly.push((curve[i].value - prev) / prev);
  }

  let sharpe = 0;
  let volatility = 0;
  if (weekly.length > 1) {
    const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
    const variance = weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length;
    const std = Math.sqrt(variance);
    volatility = std * Math.sqrt(52) * 100; // annualized %
    sharpe = std > 0 ? ((mean - 0.04 / 52) / std) * Math.sqrt(52) : 0;
  }

  const calmar = mdd > 0 ? cagr / mdd : 0;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    cagr: Math.round(cagr * 100) / 100,
    mdd: Math.round(mdd * 100) / 100,
    sharpe: Math.round(sharpe * 1000) / 1000,
    volatility: Math.round(volatility * 100) / 100,
    calmar: Math.round(calmar * 1000) / 1000,
    maxRecoveryWeeks,
  };
}

// ─── MDD percentile: "역대 주간 낙폭 중 MDD보다 낮은 비율" ────────────────────
// 결과 해석: 90% → 역대 90%의 주간보다 더 심한 하락 = 상위 10% 극단 하락
function calcMddPercentile(curve: { date: string; value: number }[], mdd: number): number {
  let peak = curve[0].value;
  const drawdowns: number[] = [];
  for (const pt of curve) {
    if (pt.value > peak) peak = pt.value;
    drawdowns.push(((peak - pt.value) / peak) * 100);
  }
  // MDD보다 낮은 주간(덜 심한 하락)이 전체의 몇 %인지
  const milder = drawdowns.filter(d => d < mdd).length;
  return Math.round((milder / drawdowns.length) * 100 * 10) / 10;
}

// ─── Composite scoring ────────────────────────────────────────────────────────

function computeScores(results: Omit<PortfolioResult, "score" | "rank">[]): PortfolioResult[] {
  const n = results.length;
  if (n === 0) return [];

  const byCagr   = [...results].sort((a, b) => b.cagr - a.cagr).map(r => r.id);
  const bySharpe  = [...results].sort((a, b) => b.sharpe - a.sharpe).map(r => r.id);
  const byMdd     = [...results].sort((a, b) => a.mdd - b.mdd).map(r => r.id);   // lower = better
  const byCalmar  = [...results].sort((a, b) => b.calmar - a.calmar).map(r => r.id);

  const scored = results.map(r => {
    const cagrRank   = byCagr.indexOf(r.id) + 1;
    const sharpeRank = bySharpe.indexOf(r.id) + 1;
    const mddRank    = byMdd.indexOf(r.id) + 1;
    const calmarRank = byCalmar.indexOf(r.id) + 1;
    const score = cagrRank * 0.35 + sharpeRank * 0.30 + mddRank * 0.20 + calmarRank * 0.15;
    return { ...r, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      period = "10y",
      initialCash = 10000,
    } = body as { period: string; initialCash: number };

    const startDate = getPeriodStart(period);
    const endDate = new Date().toISOString().slice(0, 10);

    // Collect all unique tickers
    const allTickers = [...new Set(PORTFOLIOS.flatMap(p => Object.keys(p.weights)))];

    // Fetch all ticker data in parallel
    const rawData: Record<string, WeeklyBar[] | null> = {};
    await Promise.all(
      allTickers.map(async t => {
        rawData[t] = await fetchWeekly(t, startDate, endDate);
      })
    );

    const rawResults: Omit<PortfolioResult, "score" | "rank">[] = [];

    for (const pDef of PORTFOLIOS) {
      const tickers = Object.keys(pDef.weights);

      // Check if all tickers have data
      const tickerBars: Record<string, WeeklyBar[]> = {};
      let skip = false;
      for (const t of tickers) {
        const bars = rawData[t];
        if (!bars || bars.length < 52) { skip = true; break; }
        tickerBars[t] = bars;
      }
      if (skip) continue;

      const result = backtest(tickerBars, pDef.weights, initialCash);
      if (!result || result.equityCurve.length < 52) continue;

      const { equityCurve, yearlyReturns } = result;
      const metrics = calcMetrics(equityCurve, initialCash);

      const crisis2020 = calcCrisisDrawdown(equityCurve, "2020-01-01", "2020-05-01");
      const crisis2022 = calcCrisisDrawdown(equityCurve, "2022-01-01", "2022-12-31");

      // 모든 역사적 이벤트별 낙폭
      const eventDrawdowns = HISTORICAL_EVENTS.map(ev => {
        const dd = calcCrisisDrawdown(equityCurve, ev.start, ev.end);
        // 데이터가 없으면 null (이벤트 기간 데이터 2포인트 미만)
        const window = equityCurve.filter(p => p.date >= ev.start && p.date <= ev.end);
        return { eventId: ev.id, drawdown: window.length < 2 ? null : dd };
      });

      // MDD 퍼센타일 (역대 주간 낙폭 분포 기준)
      const mddPercentile = calcMddPercentile(equityCurve, metrics.mdd);

      rawResults.push({
        id: pDef.id,
        name: pDef.name,
        riskLevel: pDef.riskLevel,
        weights: pDef.weights,
        tickers,
        actualStart: equityCurve[0].date,
        ...metrics,
        crisis2020,
        crisis2022,
        eventDrawdowns,
        mddPercentile,
        equityCurve,
        yearlyReturns,
      });
    }

    const portfolios = computeScores(rawResults);

    return NextResponse.json({ portfolios, startDate, endDate, period, events: HISTORICAL_EVENTS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
