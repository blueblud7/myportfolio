import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyBar {
  date: string;
  close: number;
}

interface EquityPoint {
  date: string;
  value: number;
  invested: number; // cumulative cash deployed
}

interface PositionResult {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  avgCost: number;          // average cost basis per share
  finalPrice: number;
  cashDrag: number;         // % of time cash was idle (opportunity cost proxy)
  totalDeployed: number;    // total cash put to work
  score: number;            // composite score (lower = better rank)
  rank: number;
  equityCurve: EquityPoint[];
  yearlyReturns: { year: number; return: number }[];
  deploymentLog: { date: string; amount: number; price: number; reason: string }[];
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchWeekly(ticker: string, start: string, end: string): Promise<WeeklyBar[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await yf.historical(ticker, { period1: start, period2: end, interval: "1wk" });
    if (!raw || raw.length < 20) return null;
    return raw
      .filter((r) => r.close != null)
      .map((r) => ({
        date: typeof r.date === "string" ? r.date : r.date.toISOString().slice(0, 10),
        close: r.adjClose ?? r.close,
      }));
  } catch {
    return null;
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function calcMetrics(curve: EquityPoint[], initialCash: number) {
  if (curve.length < 2) return { totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0 };

  const finalVal = curve[curve.length - 1].value;
  const totalReturn = ((finalVal - initialCash) / initialCash) * 100;

  const days = Math.max(1,
    (new Date(curve[curve.length - 1].date).getTime() - new Date(curve[0].date).getTime()) / 86400000
  );
  const cagr = ((finalVal / initialCash) ** (365 / days) - 1) * 100;

  let peak = curve[0].value;
  let mdd = 0;
  for (const pt of curve) {
    if (pt.value > peak) peak = pt.value;
    const dd = ((peak - pt.value) / peak) * 100;
    if (dd > mdd) mdd = dd;
  }

  const weekly: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].value;
    if (prev > 0) weekly.push((curve[i].value - prev) / prev);
  }
  let sharpe = 0;
  if (weekly.length > 1) {
    const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
    const std = Math.sqrt(weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length);
    sharpe = std > 0 ? ((mean - 0.04 / 52) / std) * Math.sqrt(52) : 0;
  }

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    cagr: Math.round(cagr * 100) / 100,
    mdd: Math.round(mdd * 100) / 100,
    sharpe: Math.round(sharpe * 1000) / 1000,
  };
}

function calcYearly(curve: EquityPoint[]): { year: number; return: number }[] {
  const map: Record<number, { start: number; end: number }> = {};
  for (const pt of curve) {
    const y = parseInt(pt.date.slice(0, 4));
    if (!map[y]) map[y] = { start: pt.value, end: pt.value };
    map[y].end = pt.value;
  }
  return Object.entries(map)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([y, { start, end }]) => ({
      year: parseInt(y),
      return: Math.round(((end - start) / start) * 1000) / 10,
    }));
}

// ─── Strategy runners ─────────────────────────────────────────────────────────

// Helper: build equity curve + deployment log from cash tranches
function buildResult(
  bars: WeeklyBar[],
  deployments: { idx: number; amount: number; reason: string }[],
  initialCash: number
): { curve: EquityPoint[]; avgCost: number; totalDeployed: number; cashDrag: number; log: PositionResult["deploymentLog"] } {
  let shares = 0;
  let cashRemaining = initialCash;
  let totalCost = 0;
  let idleWeeks = 0;

  // Sort deployments by index
  const sorted = [...deployments].sort((a, b) => a.idx - b.idx);
  const deployMap = new Map<number, { amount: number; reason: string }>();
  for (const d of sorted) {
    const existing = deployMap.get(d.idx);
    if (existing) existing.amount += d.amount;
    else deployMap.set(d.idx, { amount: d.amount, reason: d.reason });
  }

  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const deploy = deployMap.get(i);
    if (deploy && deploy.amount > 0 && cashRemaining >= deploy.amount) {
      const invest = Math.min(deploy.amount, cashRemaining);
      const bought = invest / bar.close;
      shares += bought;
      totalCost += invest;
      cashRemaining -= invest;
      log.push({ date: bar.date, amount: Math.round(invest * 100) / 100, price: bar.close, reason: deploy.reason });
    }

    const equity = shares * bar.close + cashRemaining;
    if (cashRemaining > initialCash * 0.01) idleWeeks++; // cash sitting idle
    curve.push({ date: bar.date, value: Math.round(equity * 100) / 100, invested: Math.round((initialCash - cashRemaining) * 100) / 100 });
  }

  const avgCost = shares > 0 ? totalCost / shares : 0;
  const cashDrag = Math.round((idleWeeks / bars.length) * 100);

  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag, log };
}

// 1. Lump Sum — 100% immediately
function runLumpSum(bars: WeeklyBar[], cash: number) {
  const deployments = [{ idx: 0, amount: cash, reason: "즉시 전액 투자" }];
  return buildResult(bars, deployments, cash);
}

// 2. Cash 20% — invest 80%, keep 20%
function runCash20(bars: WeeklyBar[], cash: number) {
  return buildResult(bars, [{ idx: 0, amount: cash * 0.8, reason: "초기 80% 투자" }], cash);
}

// 3. Cash 40% — invest 60%, keep 40%
function runCash40(bars: WeeklyBar[], cash: number) {
  return buildResult(bars, [{ idx: 0, amount: cash * 0.6, reason: "초기 60% 투자" }], cash);
}

// 4. 4-Split — 25% every ~13 weeks
function runSplit4(bars: WeeklyBar[], cash: number) {
  const chunk = cash / 4;
  return buildResult(bars, [0, 13, 26, 39].map((idx, i) => ({
    idx: Math.min(idx, bars.length - 1),
    amount: chunk,
    reason: `${i + 1}차 분할 (25%)`,
  })), cash);
}

// 5. 12-Split DCA — monthly for 12 months
function runSplit12(bars: WeeklyBar[], cash: number) {
  const chunk = cash / 12;
  return buildResult(bars, Array.from({ length: 12 }, (_, i) => ({
    idx: Math.min(i * 4, bars.length - 1),
    amount: chunk,
    reason: `${i + 1}개월차 DCA`,
  })), cash);
}

// 6. MDD-10 Trigger — 60% now, +20% at -10%, +20% at -20%
function runMdd10(bars: WeeklyBar[], cash: number) {
  const initial = cash * 0.6;
  let shares = initial / bars[0].close;
  let cashLeft = cash - initial;
  let peakVal = initial;
  let deployed10 = false;
  let deployed20 = false;
  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [
    { date: bars[0].date, amount: initial, price: bars[0].close, reason: "초기 60% 투자" },
  ];
  let totalCost = initial;
  let idleWeeks = 0;

  for (let i = 0; i < bars.length; i++) {
    const portfolioVal = shares * bars[i].close + cashLeft;
    if (portfolioVal > peakVal) peakVal = portfolioVal;
    const mddPct = ((peakVal - portfolioVal) / peakVal) * 100;

    if (!deployed10 && mddPct >= 10 && cashLeft >= cash * 0.2) {
      const invest = cash * 0.2;
      shares += invest / bars[i].close;
      cashLeft -= invest;
      totalCost += invest;
      deployed10 = true;
      log.push({ date: bars[i].date, amount: invest, price: bars[i].close, reason: "MDD -10% 트리거 (+20%)" });
    }
    if (!deployed20 && mddPct >= 20 && cashLeft >= cash * 0.2) {
      const invest = Math.min(cash * 0.2, cashLeft);
      shares += invest / bars[i].close;
      cashLeft -= invest;
      totalCost += invest;
      deployed20 = true;
      log.push({ date: bars[i].date, amount: invest, price: bars[i].close, reason: "MDD -20% 트리거 (+20%)" });
    }

    if (cashLeft > cash * 0.01) idleWeeks++;
    const val = shares * bars[i].close + cashLeft;
    curve.push({ date: bars[i].date, value: Math.round(val * 100) / 100, invested: Math.round((cash - cashLeft) * 100) / 100 });
  }

  const avgCost = shares > 0 ? totalCost / shares : 0;
  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag: Math.round((idleWeeks / bars.length) * 100), log };
}

// 7. MDD-20 Trigger — 60% now, +40% at -20%
function runMdd20(bars: WeeklyBar[], cash: number) {
  const initial = cash * 0.6;
  let shares = initial / bars[0].close;
  let cashLeft = cash - initial;
  let peakVal = initial;
  let deployed = false;
  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [
    { date: bars[0].date, amount: initial, price: bars[0].close, reason: "초기 60% 투자" },
  ];
  let totalCost = initial;
  let idleWeeks = 0;

  for (let i = 0; i < bars.length; i++) {
    const portfolioVal = shares * bars[i].close + cashLeft;
    if (portfolioVal > peakVal) peakVal = portfolioVal;
    const mddPct = ((peakVal - portfolioVal) / peakVal) * 100;

    if (!deployed && mddPct >= 20 && cashLeft > 0) {
      const invest = cashLeft;
      shares += invest / bars[i].close;
      totalCost += invest;
      cashLeft = 0;
      deployed = true;
      log.push({ date: bars[i].date, amount: invest, price: bars[i].close, reason: "MDD -20% 트리거 (+40%)" });
    }

    if (cashLeft > cash * 0.01) idleWeeks++;
    const val = shares * bars[i].close + cashLeft;
    curve.push({ date: bars[i].date, value: Math.round(val * 100) / 100, invested: Math.round((cash - cashLeft) * 100) / 100 });
  }

  const avgCost = shares > 0 ? totalCost / shares : 0;
  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag: Math.round((idleWeeks / bars.length) * 100), log };
}

// 8. MDD Ladder — 40% → +30% at -10% → +30% at -20%
function runMddLadder(bars: WeeklyBar[], cash: number) {
  const initial = cash * 0.4;
  let shares = initial / bars[0].close;
  let cashLeft = cash - initial;
  let peakVal = initial;
  let deployed10 = false;
  let deployed20 = false;
  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [
    { date: bars[0].date, amount: initial, price: bars[0].close, reason: "초기 40% 투자" },
  ];
  let totalCost = initial;
  let idleWeeks = 0;

  for (let i = 0; i < bars.length; i++) {
    const portfolioVal = shares * bars[i].close + cashLeft;
    if (portfolioVal > peakVal) peakVal = portfolioVal;
    const mddPct = ((peakVal - portfolioVal) / peakVal) * 100;

    if (!deployed10 && mddPct >= 10 && cashLeft >= cash * 0.3) {
      const invest = cash * 0.3;
      shares += invest / bars[i].close;
      cashLeft -= invest;
      totalCost += invest;
      deployed10 = true;
      log.push({ date: bars[i].date, amount: invest, price: bars[i].close, reason: "MDD -10% 트리거 (+30%)" });
    }
    if (!deployed20 && mddPct >= 20 && cashLeft > 0) {
      const invest = Math.min(cash * 0.3, cashLeft);
      shares += invest / bars[i].close;
      cashLeft -= invest;
      totalCost += invest;
      deployed20 = true;
      log.push({ date: bars[i].date, amount: invest, price: bars[i].close, reason: "MDD -20% 트리거 (+30%)" });
    }

    if (cashLeft > cash * 0.01) idleWeeks++;
    const val = shares * bars[i].close + cashLeft;
    curve.push({ date: bars[i].date, value: Math.round(val * 100) / 100, invested: Math.round((cash - cashLeft) * 100) / 100 });
  }

  const avgCost = shares > 0 ? totalCost / shares : 0;
  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag: Math.round((idleWeeks / bars.length) * 100), log };
}

// 9. Dip DCA — regular monthly DCA but double on -5% weeks
function runDipDca(bars: WeeklyBar[], cash: number) {
  const months = Math.max(1, Math.floor(bars.length / 4));
  const baseMonthly = cash / months;
  let budget = cash;
  let shares = 0;
  let totalCost = 0;
  let idleWeeks = 0;
  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [];

  for (let i = 0; i < bars.length; i++) {
    const weekReturn = i > 0 ? (bars[i].close - bars[i - 1].close) / bars[i - 1].close * 100 : 0;
    const isMonthly = i % 4 === 0;
    const isDip = weekReturn <= -3;

    let invest = 0;
    if (isMonthly && budget >= baseMonthly) {
      invest = baseMonthly;
    }
    if (isDip && !isMonthly && budget >= baseMonthly * 0.5) {
      invest += baseMonthly * 0.5; // extra 50% on dip weeks
    }

    if (invest > 0) {
      invest = Math.min(invest, budget);
      shares += invest / bars[i].close;
      totalCost += invest;
      budget -= invest;
      log.push({ date: bars[i].date, amount: Math.round(invest * 100) / 100, price: bars[i].close, reason: isDip ? "하락 강화 매수" : "정기 DCA" });
    }

    if (budget > cash * 0.01) idleWeeks++;
    const val = shares * bars[i].close + budget;
    curve.push({ date: bars[i].date, value: Math.round(val * 100) / 100, invested: Math.round((cash - budget) * 100) / 100 });
  }

  const avgCost = shares > 0 ? totalCost / shares : 0;
  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag: Math.round((idleWeeks / bars.length) * 100), log };
}

// 10. Momentum Cash — 80% invested when 26w momentum positive, else 50%
function runMomentumCash(bars: WeeklyBar[], cash: number) {
  const lookback = 26;
  let shares = 0;
  let cashLeft = cash;
  let totalCost = 0;
  let idleWeeks = 0;
  const curve: EquityPoint[] = [];
  const log: PositionResult["deploymentLog"] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i > 0 && i % 4 === 0 && i >= lookback) {
      const momentum = (bars[i].close - bars[i - lookback].close) / bars[i - lookback].close;
      const targetPct = momentum > 0 ? 0.8 : 0.5;
      const currentVal = shares * bars[i].close + cashLeft;
      const targetInvested = cash * targetPct;  // target based on initial capital
      const currentInvested = cash - cashLeft;

      if (currentInvested < targetInvested && cashLeft > 0) {
        const invest = Math.min(targetInvested - currentInvested, cashLeft);
        shares += invest / bars[i].close;
        totalCost += invest;
        cashLeft -= invest;
        log.push({ date: bars[i].date, amount: Math.round(invest * 100) / 100, price: bars[i].close, reason: momentum > 0 ? "모멘텀↑ 80% 조정" : "모멘텀↓ 50% 조정" });
      } else if (currentInvested > targetInvested + cash * 0.05) {
        // reduce position
        const excess = currentInvested - targetInvested;
        const sellShares = excess / bars[i].close;
        if (sellShares < shares) {
          shares -= sellShares;
          cashLeft += excess;
          log.push({ date: bars[i].date, amount: -Math.round(excess * 100) / 100, price: bars[i].close, reason: "포지션 축소" });
        }
      }
      void currentVal;
    } else if (i === 0) {
      // start with 60%
      const invest = cash * 0.6;
      shares = invest / bars[0].close;
      cashLeft = cash - invest;
      totalCost = invest;
      log.push({ date: bars[0].date, amount: invest, price: bars[0].close, reason: "초기 60% 투자" });
    }

    if (cashLeft > cash * 0.01) idleWeeks++;
    const val = shares * bars[i].close + cashLeft;
    curve.push({ date: bars[i].date, value: Math.round(val * 100) / 100, invested: Math.round((cash - cashLeft) * 100) / 100 });
  }

  const avgCost = shares > 0 ? (totalCost / shares) : 0;
  return { curve, avgCost: Math.round(avgCost * 100) / 100, totalDeployed: Math.round(totalCost * 100) / 100, cashDrag: Math.round((idleWeeks / bars.length) * 100), log };
}

// ─── Strategy metadata ────────────────────────────────────────────────────────

const STRATEGY_META = [
  { id: "lumpSum",       name: "즉시 전액 투자",      nameEn: "Lump Sum 100%",      description: "전체 자금을 첫 날 즉시 투자. 시장 타이밍을 포기하고 최대 노출." },
  { id: "cash20",        name: "현금 20% 보유",        nameEn: "Hold 20% Cash",      description: "80%만 투자, 20% 현금 대기. 중간 리스크." },
  { id: "cash40",        name: "현금 40% 보유",        nameEn: "Hold 40% Cash",      description: "60%만 투자, 40% 현금 대기. 하락 대비 여력 확보." },
  { id: "split4",        name: "4분할 매수",           nameEn: "4-Tranche Split",    description: "3개월간 25%씩 4회 분할 매수." },
  { id: "split12",       name: "12분할 DCA",           nameEn: "12-Month DCA",       description: "12개월간 매월 균등 금액 투자." },
  { id: "mdd10",         name: "MDD 10% 트리거",       nameEn: "MDD-10 Trigger",     description: "60% 초기 투자 후 낙폭 10%에 +20%, 20%에 +20% 추가 매수." },
  { id: "mdd20",         name: "MDD 20% 트리거",       nameEn: "MDD-20 Trigger",     description: "60% 초기 투자 후 낙폭 20%에 남은 40% 일괄 추가 매수." },
  { id: "mddLadder",     name: "MDD 래더 (40/30/30)", nameEn: "MDD Ladder",         description: "40% 즉시 → 낙폭 10%에 +30% → 낙폭 20%에 +30%." },
  { id: "dipDca",        name: "하락 강화 DCA",        nameEn: "Dip-Enhanced DCA",   description: "월 정기 DCA + 주간 -3% 하락 시 추가 50% 매수." },
  { id: "momentumCash",  name: "모멘텀 현금 조절",     nameEn: "Momentum Cash Mgmt", description: "26주 모멘텀 양수=80% 투자, 음수=50% 투자로 월별 조정." },
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

// ─── Composite score (lower = better) ────────────────────────────────────────

function computeScores(results: Omit<PositionResult, "score" | "rank">[]): PositionResult[] {
  const n = results.length;
  if (n === 0) return [];

  // Rank each metric
  const byCagr    = [...results].sort((a, b) => b.cagr - a.cagr).map((r) => r.id);
  const bySharpe  = [...results].sort((a, b) => b.sharpe - a.sharpe).map((r) => r.id);
  const byMdd     = [...results].sort((a, b) => a.mdd - b.mdd).map((r) => r.id); // lower MDD = better

  const scored = results.map((r) => {
    const cagrRank   = byCagr.indexOf(r.id) + 1;
    const sharpeRank = bySharpe.indexOf(r.id) + 1;
    const mddRank    = byMdd.indexOf(r.id) + 1;
    // Weighted composite rank score
    const score = cagrRank * 0.4 + sharpeRank * 0.3 + mddRank * 0.3;
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
      tickers = ["QQQ"],
      period = "10y",
      initialCash = 10000,
    } = body as { tickers: string[]; period: string; initialCash: number };

    const startDate = getPeriodStart(period);
    const endDate = new Date().toISOString().slice(0, 10);

    // Fetch data for all tickers
    const dataMap: Record<string, WeeklyBar[] | null> = {};
    await Promise.all(
      tickers.map(async (t) => { dataMap[t] = await fetchWeekly(t, startDate, endDate); })
    );

    // Run all strategies for each ticker
    const byTicker: Record<string, PositionResult[]> = {};

    for (const ticker of tickers) {
      const bars = dataMap[ticker];
      if (!bars || bars.length < 20) { byTicker[ticker] = []; continue; }

      const rawResults: Omit<PositionResult, "score" | "rank">[] = [];

      for (const meta of STRATEGY_META) {
        let built: ReturnType<typeof buildResult>;

        switch (meta.id) {
          case "lumpSum":      built = runLumpSum(bars, initialCash); break;
          case "cash20":       built = runCash20(bars, initialCash); break;
          case "cash40":       built = runCash40(bars, initialCash); break;
          case "split4":       built = runSplit4(bars, initialCash); break;
          case "split12":      built = runSplit12(bars, initialCash); break;
          case "mdd10":        built = runMdd10(bars, initialCash); break;
          case "mdd20":        built = runMdd20(bars, initialCash); break;
          case "mddLadder":    built = runMddLadder(bars, initialCash); break;
          case "dipDca":       built = runDipDca(bars, initialCash); break;
          case "momentumCash": built = runMomentumCash(bars, initialCash); break;
          default: continue;
        }

        if (built.curve.length < 2) continue;

        const metrics = calcMetrics(built.curve, initialCash);
        rawResults.push({
          id: meta.id,
          name: meta.name,
          nameEn: meta.nameEn,
          description: meta.description,
          ...metrics,
          avgCost: built.avgCost,
          finalPrice: bars[bars.length - 1].close,
          cashDrag: built.cashDrag,
          totalDeployed: built.totalDeployed,
          equityCurve: built.curve,
          yearlyReturns: calcYearly(built.curve),
          deploymentLog: built.log,
        });
      }

      byTicker[ticker] = computeScores(rawResults);
    }

    return NextResponse.json({ byTicker, startDate, endDate, period });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
