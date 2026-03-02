import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

interface WeeklyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: "rsi_crossdown" | "trailing_stop";
}

interface EquityPoint {
  date: string;
  value: number;
}

interface BacktestResult {
  ticker: string;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  winRate: number;
  totalTrades: number;
  buyHoldReturn: number;
  equityCurve: EquityPoint[];
  trades: Trade[];
  yearlyReturns: { year: number; return: number }[];
}

async function fetchWeekly(ticker: string, start: string, end: string): Promise<WeeklyBar[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await yf.historical(ticker, {
      period1: start,
      period2: end,
      interval: "1wk",
    });
    if (!raw || raw.length < 60) return null;
    return raw.map((r) => ({
      date: typeof r.date === "string" ? r.date : r.date.toISOString().slice(0, 10),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.adjClose ?? r.close,
      volume: r.volume ?? 0,
    }));
  } catch {
    return null;
  }
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

function runSingleBacktest(
  ticker: string,
  bars: WeeklyBar[],
  rsiOb: number,
  trailPct: number,
  initialCash: number
): BacktestResult {
  const closes = bars.map((b) => b.close);
  const rsiArr = calcRsi(closes, 14);
  const lookback = 52;

  let cash = initialCash;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = "";
  let peakPrice = 0;
  let rsiPeaked = false;
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  let maxEquity = initialCash;
  let maxDrawdown = 0;

  const yearlyMap: Record<number, { startVal: number; endVal: number }> = {};

  for (let i = lookback + 1; i < bars.length; i++) {
    const bar = bars[i];
    const close = closes[i];
    const rsi = rsiArr[i];
    const year = parseInt(bar.date.slice(0, 4));

    // 52주 최고가 (이전 봉 기준)
    const hi52 = Math.max(...closes.slice(i - lookback, i));

    const equity = cash + shares * close;
    if (!yearlyMap[year]) yearlyMap[year] = { startVal: equity, endVal: equity };
    yearlyMap[year].endVal = equity;

    equityCurve.push({ date: bar.date, value: Math.round(equity * 100) / 100 });
    if (equity > maxEquity) maxEquity = equity;
    const dd = (maxEquity - equity) / maxEquity * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // 포지션 있으면 매도 체크
    if (shares > 0) {
      if (close > peakPrice) peakPrice = close;
      if (rsi >= rsiOb) rsiPeaked = true;

      let exitReason: Trade["reason"] | null = null;
      if (rsiPeaked && rsi < rsiOb) exitReason = "rsi_crossdown";
      else if (close <= peakPrice * (1 - trailPct / 100)) exitReason = "trailing_stop";

      if (exitReason) {
        const pnl = (close - entryPrice) * shares;
        trades.push({
          ticker,
          entryDate,
          exitDate: bar.date,
          entryPrice,
          exitPrice: close,
          shares,
          pnl: Math.round(pnl * 100) / 100,
          pnlPct: Math.round(((close - entryPrice) / entryPrice * 100) * 100) / 100,
          reason: exitReason,
        });
        cash += close * shares;
        shares = 0;
        peakPrice = 0;
        rsiPeaked = false;
        entryPrice = 0;
        entryDate = "";
      }
    }

    // 매수 체크 (포지션 없을 때)
    if (shares === 0 && !isNaN(rsi) && close > hi52) {
      shares = Math.floor(cash / close);
      if (shares > 0) {
        cash -= shares * close;
        entryPrice = close;
        entryDate = bar.date;
        peakPrice = close;
        rsiPeaked = false;
      }
    }
  }

  // 마지막 포지션 청산
  if (shares > 0 && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const close = lastBar.close;
    const pnl = (close - entryPrice) * shares;
    trades.push({
      ticker,
      entryDate,
      exitDate: lastBar.date,
      entryPrice,
      exitPrice: close,
      shares,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(((close - entryPrice) / entryPrice * 100) * 100) / 100,
      reason: "trailing_stop",
    });
    cash += close * shares;
  }

  const finalValue = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : initialCash;
  const totalReturn = (finalValue - initialCash) / initialCash * 100;
  const days = bars.length * 7;
  const cagr = days > 0 ? ((finalValue / initialCash) ** (365 / days) - 1) * 100 : 0;
  const buyHoldReturn = (closes[closes.length - 1] - closes[lookback]) / closes[lookback] * 100;

  const won = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (won / trades.length) * 100 : 0;

  // Sharpe (weekly returns)
  const weeklyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    weeklyReturns.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value);
  }
  let sharpe = 0;
  if (weeklyReturns.length > 1) {
    const mean = weeklyReturns.reduce((a, b) => a + b, 0) / weeklyReturns.length;
    const std = Math.sqrt(weeklyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / weeklyReturns.length);
    const riskFreeWeekly = 0.04 / 52;
    sharpe = std > 0 ? ((mean - riskFreeWeekly) / std) * Math.sqrt(52) : 0;
  }

  const yearlyReturns = Object.entries(yearlyMap).map(([year, { startVal, endVal }]) => ({
    year: parseInt(year),
    return: Math.round(((endVal - startVal) / startVal * 100) * 10) / 10,
  }));

  return {
    ticker,
    totalReturn: Math.round(totalReturn * 100) / 100,
    cagr: Math.round(cagr * 100) / 100,
    mdd: Math.round(maxDrawdown * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    totalTrades: trades.length,
    buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
    equityCurve,
    trades,
    yearlyReturns,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tickers = ["AAPL"],
      start = "2020-01-01",
      end = new Date().toISOString().slice(0, 10),
      rsiOb = 80,
      trailPct = 25,
      initialCash = 10000,
    } = body;

    const results = await Promise.all(
      tickers.map(async (ticker: string) => {
        const bars = await fetchWeekly(ticker, start, end);
        if (!bars) return null;
        return runSingleBacktest(ticker, bars, rsiOb, trailPct, initialCash);
      })
    );

    const valid = results.filter(Boolean);
    return NextResponse.json({ results: valid });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
