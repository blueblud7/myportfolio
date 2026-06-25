import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export const maxDuration = 60;

interface Bar { date: string; close: number; high: number; low: number }

export interface ThTrade {
  entryDate: string; entryPrice: number;
  exitDate: string | null; exitPrice: number | null;
  pnlPct: number | null; reason: string;
}
export interface ThGridCell {
  buyDrop: number; sellRise: number;
  totalReturn: number; winRate: number; trades: number;
}
export interface ThYearVol {
  year: number; avgHv20: number; minHv20: number; maxHv20: number; priceReturn: number;
}
export interface ThresholdLabResponse {
  ticker: string; name: string; years: number;
  params: { buyDrop: number; sellRise: number; stop: number | null };
  // 백테스트
  totalReturn: number; cagr: number; mdd: number; winRate: number; totalTrades: number;
  buyHoldReturn: number;
  equityCurve: { date: string; strategy: number; buyhold: number }[];
  trades: ThTrade[];
  // 변동성 추이
  volSeries: { date: string; hv20: number | null; hv60: number | null }[];
  byYear: ThYearVol[];
  currentHv20: number; currentHv60: number;
  dailySigmaPct: number; atrPct: number;
  // 그리드 서치 + 추천
  grid: ThGridCell[];
  buyDropOptions: number[]; sellRiseOptions: number[];
  suggestion: { buyDrop: number; sellRise: number; rationale: string };
}

function rollingHV(closes: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = window; i < closes.length; i++) {
    const slice = closes.slice(i - window, i + 1);
    const lr: number[] = [];
    for (let j = 1; j < slice.length; j++) lr.push(Math.log(slice[j] / slice[j - 1]));
    const mean = lr.reduce((s, v) => s + v, 0) / lr.length;
    const variance = lr.reduce((s, v) => s + (v - mean) ** 2, 0) / (lr.length - 1);
    result.push(Math.sqrt(variance * 252) * 100);
  }
  return result;
}

/** 임계값 밴드 매매: 고점 대비 buyDrop% 하락 시 매수, 매수가 대비 sellRise% 상승 시 매도(옵션 stop% 손절) */
function runThreshold(bars: Bar[], buyDrop: number, sellRise: number, stop: number | null) {
  const initial = 10000;
  let cash = initial, shares = 0, entry = 0, entryDate = "";
  let peak = bars[0].close;
  const trades: ThTrade[] = [];
  const equity: number[] = [];
  for (const b of bars) {
    const p = b.close;
    if (shares === 0) {
      if (p > peak) peak = p;
      if (p <= peak * (1 - buyDrop / 100)) {
        shares = cash / p; entry = p; entryDate = b.date; cash = 0;
      }
    } else {
      const tp = p >= entry * (1 + sellRise / 100);
      const sl = stop != null && p <= entry * (1 - stop / 100);
      if (tp || sl) {
        cash = shares * p;
        trades.push({ entryDate, entryPrice: entry, exitDate: b.date, exitPrice: p, pnlPct: (p / entry - 1) * 100, reason: tp ? "익절" : "손절" });
        shares = 0; peak = p;
      }
    }
    equity.push(cash + shares * p);
  }
  // 미청산 포지션은 보유 평가로 남김 (마지막 trade는 open 상태로 표시)
  if (shares > 0) {
    const p = bars[bars.length - 1].close;
    trades.push({ entryDate, entryPrice: entry, exitDate: null, exitPrice: null, pnlPct: (p / entry - 1) * 100, reason: "보유중" });
  }
  return { trades, equity, initial };
}

function maxDrawdown(equity: number[]): number {
  let peak = -Infinity, mdd = 0;
  for (const e of equity) { peak = Math.max(peak, e); if (peak > 0) mdd = Math.min(mdd, e / peak - 1); }
  return mdd * 100;
}

async function fetchBars(symbol: string, years: number): Promise<Bar[] | null> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yf.chart(symbol, {
    period1: start.toISOString().split("T")[0],
    period2: end.toISOString().split("T")[0],
    interval: "1d",
  });
  if (!result?.quotes) return null;
  const bars = result.quotes
    .filter((q: { close: number | null; high: number | null; low: number | null; date: Date }) => q.close != null)
    .map((q: { close: number; high: number | null; low: number | null; date: Date }) => ({
      date: q.date.toISOString().split("T")[0],
      close: q.close,
      high: q.high ?? q.close,
      low: q.low ?? q.close,
    })) as Bar[];
  return bars.length >= 60 ? bars : null;
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const ticker = (sp.get("ticker") ?? "").trim();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const years = [1, 2, 3, 5].includes(Number(sp.get("years"))) ? Number(sp.get("years")) : 3;
  const buyDrop = clamp(Number(sp.get("buyDrop")) || 5, 1, 50);
  const sellRise = clamp(Number(sp.get("sellRise")) || 10, 1, 100);
  const stopRaw = Number(sp.get("stop"));
  const stop = sp.get("stop") && stopRaw > 0 ? clamp(stopRaw, 1, 90) : null;

  const symbol = resolveYahooSymbol(ticker);
  let bars: Bar[] | null = null;
  try {
    bars = await fetchBars(symbol, years);
    // 한국 종목이 .KS 실패 시 .KQ 재시도
    if (!bars && /^\d[A-Z0-9]{5}$/i.test(ticker)) {
      bars = await fetchBars(`${ticker}.KQ`, years);
    }
  } catch { bars = null; }
  if (!bars) return NextResponse.json({ error: "가격 데이터를 가져오지 못했습니다." }, { status: 502 });

  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const yearsActual = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (365.25 * 864e5) || years;

  // ── 선택 파라미터 백테스트 ──
  const bt = runThreshold(bars, buyDrop, sellRise, stop);
  const finalEq = bt.equity[bt.equity.length - 1];
  const totalReturn = (finalEq / bt.initial - 1) * 100;
  const cagr = (Math.pow(finalEq / bt.initial, 1 / yearsActual) - 1) * 100;
  const mdd = maxDrawdown(bt.equity);
  const closed = bt.trades.filter((t) => t.exitDate != null);
  const wins = closed.filter((t) => (t.pnlPct ?? 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const buyHoldReturn = (closes[closes.length - 1] / closes[0] - 1) * 100;
  const bhUnit = bt.initial / closes[0];
  const equityCurve = bars.map((b, i) => ({ date: b.date, strategy: bt.equity[i], buyhold: bhUnit * b.close }));

  // ── 변동성 추이 ──
  const hv20 = rollingHV(closes, 20);
  const hv60 = rollingHV(closes, 60);
  const hv20ByDate = new Map<string, number>();
  hv20.forEach((v, i) => hv20ByDate.set(dates[i + 20], v));
  const hv60ByDate = new Map<string, number>();
  hv60.forEach((v, i) => hv60ByDate.set(dates[i + 60], v));
  const volSeries = dates.map((d) => ({ date: d, hv20: hv20ByDate.get(d) ?? null, hv60: hv60ByDate.get(d) ?? null }));

  // 연도별 변동성 + 가격 수익률
  const byYearMap = new Map<number, { hv: number[]; first: number; last: number }>();
  bars.forEach((b) => {
    const y = Number(b.date.slice(0, 4));
    const e = byYearMap.get(y) ?? { hv: [], first: b.close, last: b.close };
    const h = hv20ByDate.get(b.date);
    if (h != null) e.hv.push(h);
    e.last = b.close;
    byYearMap.set(y, e);
  });
  const byYear: ThYearVol[] = [...byYearMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, e]) => ({
    year,
    avgHv20: e.hv.length ? e.hv.reduce((s, v) => s + v, 0) / e.hv.length : 0,
    minHv20: e.hv.length ? Math.min(...e.hv) : 0,
    maxHv20: e.hv.length ? Math.max(...e.hv) : 0,
    priceReturn: (e.last / e.first - 1) * 100,
  }));

  // 일간 변동성(로그수익률 표준편차) · ATR%
  const dlr: number[] = [];
  for (let i = 1; i < closes.length; i++) dlr.push(Math.log(closes[i] / closes[i - 1]));
  const dlrMean = dlr.reduce((s, v) => s + v, 0) / dlr.length;
  const dailySigmaPct = Math.sqrt(dlr.reduce((s, v) => s + (v - dlrMean) ** 2, 0) / (dlr.length - 1)) * 100;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    trs.push(tr);
  }
  const atr = trs.slice(-14).reduce((s, v) => s + v, 0) / Math.min(14, trs.length);
  const atrPct = (atr / closes[closes.length - 1]) * 100;

  // ── 그리드 서치 ──
  const buyDropOptions = [3, 5, 7, 10, 15];
  const sellRiseOptions = [5, 8, 10, 15, 20, 30];
  const grid: ThGridCell[] = [];
  for (const x of buyDropOptions) {
    for (const y of sellRiseOptions) {
      const r = runThreshold(bars, x, y, stop);
      const eq = r.equity[r.equity.length - 1];
      const cl = r.trades.filter((t) => t.exitDate != null);
      const w = cl.filter((t) => (t.pnlPct ?? 0) > 0).length;
      grid.push({ buyDrop: x, sellRise: y, totalReturn: (eq / r.initial - 1) * 100, winRate: cl.length ? (w / cl.length) * 100 : 0, trades: cl.length });
    }
  }
  // 추천: 거래수 4회 이상 중 총수익 최고 (과최적화 방지), 없으면 전체 최고
  const enough = grid.filter((g) => g.trades >= 4);
  const best = (enough.length ? enough : grid).slice().sort((a, b) => b.totalReturn - a.totalReturn)[0];
  const suggestion = {
    buyDrop: best.buyDrop, sellRise: best.sellRise,
    rationale: `최근 ${years}년 일간 변동성 ±${dailySigmaPct.toFixed(1)}%(ATR ${atrPct.toFixed(1)}%) 기준, 매수 -${best.buyDrop}% / 매도 +${best.sellRise}% 조합이 거래 ${best.trades}회·승률 ${best.winRate.toFixed(0)}%·총수익 ${best.totalReturn.toFixed(0)}%로 가장 우수했습니다. 변동성이 클수록 밴드를 넓게(예: 매수 -${Math.max(3, Math.round(dailySigmaPct * 3))}% 이상) 잡는 것이 휩쏘를 줄입니다.`,
  };

  const name = (bars && (await getName(symbol))) || ticker;

  const body: ThresholdLabResponse = {
    ticker, name, years,
    params: { buyDrop, sellRise, stop },
    totalReturn, cagr, mdd, winRate, totalTrades: closed.length, buyHoldReturn,
    equityCurve, trades: bt.trades.slice().reverse(),
    volSeries, byYear, currentHv20: hv20[hv20.length - 1] ?? 0, currentHv60: hv60[hv60.length - 1] ?? 0,
    dailySigmaPct, atrPct,
    grid, buyDropOptions, sellRiseOptions, suggestion,
  };
  return NextResponse.json(body);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

async function getName(symbol: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote(symbol);
    return q?.shortName ?? q?.longName ?? null;
  } catch { return null; }
}
