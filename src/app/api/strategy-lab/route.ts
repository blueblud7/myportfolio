import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EquityPoint {
  date: string;
  value: number;
}

interface StrategyResult {
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number | null;
  totalTrades: number;
  equityCurve: EquityPoint[];
  yearlyReturns: { year: number; return: number }[];
}

interface StrategyDef {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  results: Record<string, StrategyResult | null>;
}

// ─── Indicator Utilities ──────────────────────────────────────────────────────

function calcSma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

function calcEma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  let started = false;
  let ema = 0;
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(data[i])) continue;
    if (!started) {
      count++;
      ema += data[i];
      if (count === period) {
        ema /= period;
        result[i] = ema;
        started = true;
      }
    } else {
      ema = data[i] * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

function calcRsi(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcMacd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[] } {
  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);
  const macdLine: number[] = closes.map((_, i) => {
    if (isNaN(fastEma[i]) || isNaN(slowEma[i])) return NaN;
    return fastEma[i] - slowEma[i];
  });
  const signalLine = calcEma(macdLine, signal);
  return { macd: macdLine, signal: signalLine };
}

function calcBollinger(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number[]; lower: number[]; middle: number[] } {
  const middle = calcSma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    if (isNaN(middle[i])) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - middle[i]) ** 2;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = middle[i] + stdDev * sd;
    lower[i] = middle[i] - stdDev * sd;
  }
  return { upper, lower, middle };
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

function calcMetrics(
  equityCurve: EquityPoint[],
  initialCash: number,
  trades: { pnl: number }[],
  includeWinRate: boolean
): {
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number | null;
} {
  if (equityCurve.length === 0) {
    return { totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0, winRate: null };
  }

  const finalValue = equityCurve[equityCurve.length - 1].value;
  const totalReturn = ((finalValue - initialCash) / initialCash) * 100;

  const firstDate = new Date(equityCurve[0].date);
  const lastDate = new Date(equityCurve[equityCurve.length - 1].date);
  const days = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / 86400000);
  const cagr = ((finalValue / initialCash) ** (365 / days) - 1) * 100;

  // MDD
  let peak = equityCurve[0].value;
  let mdd = 0;
  for (const pt of equityCurve) {
    if (pt.value > peak) peak = pt.value;
    const dd = ((peak - pt.value) / peak) * 100;
    if (dd > mdd) mdd = dd;
  }

  // Sharpe (weekly returns, 4% annual risk-free)
  const weeklyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    if (prev > 0) weeklyReturns.push((equityCurve[i].value - prev) / prev);
  }
  let sharpe = 0;
  if (weeklyReturns.length > 1) {
    const mean = weeklyReturns.reduce((a, b) => a + b, 0) / weeklyReturns.length;
    const std = Math.sqrt(
      weeklyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / weeklyReturns.length
    );
    const rfWeekly = 0.04 / 52;
    sharpe = std > 0 ? ((mean - rfWeekly) / std) * Math.sqrt(52) : 0;
  }

  let winRate: number | null = null;
  if (includeWinRate && trades.length > 0) {
    const won = trades.filter((t) => t.pnl > 0).length;
    winRate = (won / trades.length) * 100;
  }

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    cagr: Math.round(cagr * 100) / 100,
    mdd: Math.round(mdd * 100) / 100,
    sharpe: Math.round(sharpe * 1000) / 1000,
    winRate: winRate !== null ? Math.round(winRate * 10) / 10 : null,
  };
}

function calcYearlyReturns(equityCurve: EquityPoint[]): { year: number; return: number }[] {
  if (equityCurve.length === 0) return [];
  const yearMap: Record<number, { start: number; end: number }> = {};
  for (const pt of equityCurve) {
    const year = parseInt(pt.date.slice(0, 4));
    if (!yearMap[year]) yearMap[year] = { start: pt.value, end: pt.value };
    yearMap[year].end = pt.value;
  }
  return Object.entries(yearMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, { start, end }]) => ({
      year: parseInt(year),
      return: Math.round(((end - start) / start) * 1000) / 10,
    }));
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchWeekly(
  ticker: string,
  start: string,
  end: string
): Promise<WeeklyBar[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await yf.historical(ticker, {
      period1: start,
      period2: end,
      interval: "1wk",
    });
    if (!raw || raw.length < 10) return null;
    return raw
      .filter((r) => r.close != null)
      .map((r) => ({
        date: typeof r.date === "string" ? r.date : r.date.toISOString().slice(0, 10),
        open: r.open ?? r.close,
        high: r.high ?? r.close,
        low: r.low ?? r.close,
        close: r.adjClose ?? r.close,
        volume: r.volume ?? 0,
      }));
  } catch {
    return null;
  }
}

// ─── Warmup date helper ───────────────────────────────────────────────────────

function subtractWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

// ─── Strategy Implementations ─────────────────────────────────────────────────

function runBuyHold(bars: WeeklyBar[], initialCash: number, startDate: string): StrategyResult {
  const startIdx = bars.findIndex((b) => b.date >= startDate);
  const slicedBars = startIdx >= 0 ? bars.slice(startIdx) : bars;
  if (slicedBars.length === 0) {
    return {
      totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0, winRate: null, totalTrades: 0,
      equityCurve: [], yearlyReturns: [],
    };
  }

  const buyPrice = slicedBars[0].close;
  const shares = buyPrice > 0 ? initialCash / buyPrice : 0;
  const equityCurve: EquityPoint[] = slicedBars.map((b) => ({
    date: b.date,
    value: Math.round(shares * b.close * 100) / 100,
  }));

  const metrics = calcMetrics(equityCurve, initialCash, [], false);
  return {
    ...metrics,
    winRate: null,
    totalTrades: 0,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runDca(bars: WeeklyBar[], initialCash: number, startDate: string): StrategyResult {
  const startIdx = bars.findIndex((b) => b.date >= startDate);
  const slicedBars = startIdx >= 0 ? bars.slice(startIdx) : bars;
  if (slicedBars.length === 0) {
    return {
      totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0, winRate: null, totalTrades: 0,
      equityCurve: [], yearlyReturns: [],
    };
  }

  const numMonths = Math.max(1, Math.floor(slicedBars.length / 4));
  const monthlyAmount = initialCash / numMonths;
  let monthsInvested = 0;
  let shares = 0;
  let cashInvested = 0;
  const equityCurve: EquityPoint[] = [];

  for (let i = 0; i < slicedBars.length; i++) {
    const bar = slicedBars[i];
    if (i % 4 === 0 && monthsInvested < numMonths) {
      const invest = monthlyAmount;
      shares += bar.close > 0 ? invest / bar.close : 0;
      cashInvested += invest;
      monthsInvested++;
    }
    const remainingCash = Math.max(0, initialCash - cashInvested);
    const equity = shares * bar.close + remainingCash;
    equityCurve.push({ date: bar.date, value: Math.round(equity * 100) / 100 });
  }

  const metrics = calcMetrics(equityCurve, initialCash, [], false);
  return {
    ...metrics,
    winRate: null,
    totalTrades: 0,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runGoldenCross(
  bars: WeeklyBar[],
  initialCash: number,
  startDate: string
): StrategyResult {
  const closes = bars.map((b) => b.close);
  const sma10 = calcSma(closes, 10);
  const sma40 = calcSma(closes, 40);

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 1; i < bars.length; i++) {
    const close = closes[i];
    if (isNaN(sma10[i]) || isNaN(sma40[i]) || isNaN(sma10[i - 1]) || isNaN(sma40[i - 1])) {
      allEquity.push({ date: bars[i].date, value: cash + shares * close });
      continue;
    }

    const equity = cash + shares * close;
    const crossedAbove = sma10[i - 1] <= sma40[i - 1] && sma10[i] > sma40[i];
    const crossedBelow = sma10[i - 1] >= sma40[i - 1] && sma10[i] < sma40[i];

    if (shares === 0 && crossedAbove) {
      shares = Math.floor(cash / close);
      if (shares > 0) {
        cash -= shares * close;
        entryPrice = close;
      }
    } else if (shares > 0 && crossedBelow) {
      const pnl = (close - entryPrice) * shares;
      trades.push({ pnl });
      cash += shares * close;
      shares = 0;
      entryPrice = 0;
    }

    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runRsiMeanReversion(
  bars: WeeklyBar[],
  initialCash: number,
  startDate: string
): StrategyResult {
  const closes = bars.map((b) => b.close);
  const rsiArr = calcRsi(closes, 14);

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const close = closes[i];
    const rsi = rsiArr[i];

    if (!isNaN(rsi)) {
      if (shares === 0 && rsi < 30) {
        shares = Math.floor(cash / close);
        if (shares > 0) {
          cash -= shares * close;
          entryPrice = close;
        }
      } else if (shares > 0 && rsi > 70) {
        const pnl = (close - entryPrice) * shares;
        trades.push({ pnl });
        cash += shares * close;
        shares = 0;
        entryPrice = 0;
      }
    }

    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runMacd(bars: WeeklyBar[], initialCash: number, startDate: string): StrategyResult {
  const closes = bars.map((b) => b.close);
  const { macd: macdLine, signal: signalLine } = calcMacd(closes, 12, 26, 9);

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 1; i < bars.length; i++) {
    const close = closes[i];
    if (
      isNaN(macdLine[i]) || isNaN(signalLine[i]) ||
      isNaN(macdLine[i - 1]) || isNaN(signalLine[i - 1])
    ) {
      allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
      continue;
    }

    const crossedAbove = macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i];
    const crossedBelow = macdLine[i - 1] >= signalLine[i - 1] && macdLine[i] < signalLine[i];

    if (shares === 0 && crossedAbove) {
      shares = Math.floor(cash / close);
      if (shares > 0) {
        cash -= shares * close;
        entryPrice = close;
      }
    } else if (shares > 0 && crossedBelow) {
      const pnl = (close - entryPrice) * shares;
      trades.push({ pnl });
      cash += shares * close;
      shares = 0;
      entryPrice = 0;
    }

    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runBollinger(bars: WeeklyBar[], initialCash: number, startDate: string): StrategyResult {
  const closes = bars.map((b) => b.close);
  const { upper, lower } = calcBollinger(closes, 20, 2);

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const close = closes[i];
    if (!isNaN(lower[i]) && !isNaN(upper[i])) {
      if (shares === 0 && close < lower[i]) {
        shares = Math.floor(cash / close);
        if (shares > 0) {
          cash -= shares * close;
          entryPrice = close;
        }
      } else if (shares > 0 && close > upper[i]) {
        const pnl = (close - entryPrice) * shares;
        trades.push({ pnl });
        cash += shares * close;
        shares = 0;
        entryPrice = 0;
      }
    }
    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runMomentum52(
  bars: WeeklyBar[],
  initialCash: number,
  startDate: string
): StrategyResult {
  const closes = bars.map((b) => b.close);
  const lookback = 52;

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const close = closes[i];
    if (i >= lookback && i % 4 === 0) {
      const ret52 = (close - closes[i - lookback]) / closes[i - lookback];
      if (ret52 > 0) {
        if (shares === 0) {
          shares = Math.floor(cash / close);
          if (shares > 0) {
            cash -= shares * close;
            entryPrice = close;
          }
        }
      } else {
        if (shares > 0) {
          const pnl = (close - entryPrice) * shares;
          trades.push({ pnl });
          cash += shares * close;
          shares = 0;
          entryPrice = 0;
        }
      }
    }
    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

function runTurtle(bars: WeeklyBar[], initialCash: number, startDate: string): StrategyResult {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const entryPeriod = 52;
  const exitPeriod = 26;

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  const trades: { pnl: number }[] = [];
  const allEquity: { date: string; value: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const close = closes[i];
    if (i >= entryPeriod) {
      const hi52 = Math.max(...highs.slice(i - entryPeriod, i));
      const lo26 = Math.min(...lows.slice(Math.max(0, i - exitPeriod), i));

      if (shares === 0 && close > hi52) {
        shares = Math.floor(cash / close);
        if (shares > 0) {
          cash -= shares * close;
          entryPrice = close;
        }
      } else if (shares > 0 && close < lo26) {
        const pnl = (close - entryPrice) * shares;
        trades.push({ pnl });
        cash += shares * close;
        shares = 0;
        entryPrice = 0;
      }
    }
    allEquity.push({ date: bars[i].date, value: Math.round((cash + shares * close) * 100) / 100 });
  }

  const startIdx = allEquity.findIndex((e) => e.date >= startDate);
  const equityCurve = startIdx >= 0 ? allEquity.slice(startIdx) : allEquity;
  const startValue = equityCurve.length > 0 ? equityCurve[0].value : initialCash;
  const metrics = calcMetrics(equityCurve, startValue, trades, true);

  return {
    ...metrics,
    totalTrades: trades.length,
    equityCurve,
    yearlyReturns: calcYearlyReturns(equityCurve),
  };
}

// ─── Strategy Registry ────────────────────────────────────────────────────────

const STRATEGY_META: {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  warmupWeeks: number;
}[] = [
  {
    id: "buyHold",
    name: "바이 앤 홀드",
    nameEn: "Buy & Hold",
    description: "첫 번째 가능한 봉에서 매수 후 보유. 기준 전략.",
    warmupWeeks: 0,
  },
  {
    id: "dca",
    name: "정액 분할매수 (DCA)",
    nameEn: "Dollar Cost Averaging",
    description: "4주마다 균등 금액을 투자하는 분할매수 전략.",
    warmupWeeks: 0,
  },
  {
    id: "goldenCross",
    name: "골든 크로스",
    nameEn: "Golden Cross (10/40w SMA)",
    description: "10주 SMA가 40주 SMA를 상향 돌파 시 매수, 하향 돌파 시 매도.",
    warmupWeeks: 50,
  },
  {
    id: "rsiMeanReversion",
    name: "RSI 평균회귀",
    nameEn: "RSI Mean Reversion",
    description: "RSI(14) 30 이하 매수, 70 이상 매도. 과매도/과매수 역발상 전략.",
    warmupWeeks: 20,
  },
  {
    id: "macd",
    name: "MACD 크로스",
    nameEn: "MACD Crossover",
    description: "MACD선이 시그널선을 상향 돌파 시 매수, 하향 돌파 시 매도.",
    warmupWeeks: 40,
  },
  {
    id: "bollinger",
    name: "볼린저 밴드",
    nameEn: "Bollinger Band Reversion",
    description: "종가가 하단 밴드 이탈 시 매수, 상단 밴드 돌파 시 매도.",
    warmupWeeks: 25,
  },
  {
    id: "momentum52",
    name: "52주 모멘텀",
    nameEn: "52-Week Momentum",
    description: "4주마다 52주 수익률이 양수면 보유, 음수면 현금화.",
    warmupWeeks: 56,
  },
  {
    id: "turtle",
    name: "터틀 트레이딩",
    nameEn: "Turtle Trading",
    description: "52주 고가 돌파 시 매수, 26주 저가 하향 시 매도.",
    warmupWeeks: 56,
  },
];

// ─── Period Calculation ───────────────────────────────────────────────────────

function getPeriodStartDate(period: string): string {
  const today = new Date();
  switch (period) {
    case "1y":
      today.setFullYear(today.getFullYear() - 1);
      break;
    case "3y":
      today.setFullYear(today.getFullYear() - 3);
      break;
    case "5y":
      today.setFullYear(today.getFullYear() - 5);
      break;
    case "10y":
      today.setFullYear(today.getFullYear() - 10);
      break;
    case "max":
      return "2000-01-01";
    default:
      today.setFullYear(today.getFullYear() - 5);
  }
  return today.toISOString().slice(0, 10);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tickers = ["QQQ", "VOO"],
      period = "5y",
      initialCash = 10000,
      strategies = ["all"],
    } = body as {
      tickers: string[];
      period: string;
      initialCash: number;
      strategies: string[];
    };

    const startDate = getPeriodStartDate(period);
    const endDate = new Date().toISOString().slice(0, 10);

    const runAll = strategies.includes("all");
    const selectedStrategies = runAll
      ? STRATEGY_META.map((s) => s.id)
      : STRATEGY_META.filter((s) => strategies.includes(s.id)).map((s) => s.id);

    // For each ticker, fetch data with enough warmup
    const maxWarmup = Math.max(...STRATEGY_META.map((s) => s.warmupWeeks));
    const fetchStart = subtractWeeks(startDate, maxWarmup + 4);

    const tickerDataMap: Record<string, WeeklyBar[] | null> = {};
    await Promise.all(
      tickers.map(async (ticker: string) => {
        tickerDataMap[ticker] = await fetchWeekly(ticker, fetchStart, endDate);
      })
    );

    const strategyResults: Record<string, StrategyDef> = {};

    for (const meta of STRATEGY_META) {
      if (!selectedStrategies.includes(meta.id)) continue;

      const results: Record<string, StrategyResult | null> = {};

      for (const ticker of tickers) {
        const bars = tickerDataMap[ticker];
        if (!bars || bars.length < 10) {
          results[ticker] = null;
          continue;
        }

        try {
          let result: StrategyResult;
          switch (meta.id) {
            case "buyHold":
              result = runBuyHold(bars, initialCash, startDate);
              break;
            case "dca":
              result = runDca(bars, initialCash, startDate);
              break;
            case "goldenCross":
              result = runGoldenCross(bars, initialCash, startDate);
              break;
            case "rsiMeanReversion":
              result = runRsiMeanReversion(bars, initialCash, startDate);
              break;
            case "macd":
              result = runMacd(bars, initialCash, startDate);
              break;
            case "bollinger":
              result = runBollinger(bars, initialCash, startDate);
              break;
            case "momentum52":
              result = runMomentum52(bars, initialCash, startDate);
              break;
            case "turtle":
              result = runTurtle(bars, initialCash, startDate);
              break;
            default:
              result = runBuyHold(bars, initialCash, startDate);
          }
          results[ticker] = result.equityCurve.length < 2 ? null : result;
        } catch {
          results[ticker] = null;
        }
      }

      strategyResults[meta.id] = {
        id: meta.id,
        name: meta.name,
        nameEn: meta.nameEn,
        description: meta.description,
        results,
      };
    }

    return NextResponse.json({ strategies: strategyResults, startDate, endDate, period });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
