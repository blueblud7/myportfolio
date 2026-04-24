import { NextRequest, NextResponse } from "next/server";

export interface CashOptCell {
  vixTrigger: number;    // VIX 기준점
  cashRatio: number;     // 현금 비율 (0~50%)
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpe: number;
  calmar: number;
}

export interface CashOptResult {
  cells: CashOptCell[];
  baseline: { totalReturn: number; cagr: number; mdd: number; sharpe: number };
  bestByCalmar: CashOptCell;
  bestBySharpe: CashOptCell;
  period: string;
  startDate: string;
  endDate: string;
  trigger: string;
}

const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

async function fetchMonthlyClose(symbol: string, period: string): Promise<{ date: string; close: number }[]> {
  const now = Math.floor(Date.now() / 1000);
  const periodMap: Record<string, number> = {
    "1y": 365, "2y": 730, "3y": 1095, "5y": 1825, "10y": 3650,
  };
  const days = periodMap[period] ?? 1825;
  const from = now - days * 86400;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&period1=${from}&period2=${now}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 7),
      close: closes[i],
    }))
    .filter(d => d.close != null && d.close > 0);
}

function calcMetrics(monthlyReturns: number[], riskFreeMonthly = 0.0035) {
  if (monthlyReturns.length === 0) return { totalReturn: 0, cagr: 0, mdd: 0, sharpe: 0, calmar: 0 };

  // equity curve
  let equity = 1;
  const curve: number[] = [1];
  for (const r of monthlyReturns) {
    equity *= (1 + r);
    curve.push(equity);
  }

  const totalReturn = (equity - 1) * 100;
  const years = monthlyReturns.length / 12;
  const cagr = years > 0 ? (Math.pow(equity, 1 / years) - 1) * 100 : 0;

  // max drawdown
  let peak = 1; let mdd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > mdd) mdd = dd;
  }
  const mddPct = mdd * 100;

  // sharpe
  const avgExcess = monthlyReturns.reduce((s, r) => s + (r - riskFreeMonthly), 0) / monthlyReturns.length;
  const std = Math.sqrt(monthlyReturns.reduce((s, r) => s + Math.pow(r - riskFreeMonthly - avgExcess + riskFreeMonthly, 2), 0) / monthlyReturns.length);
  const sharpe = std > 0 ? (avgExcess / std) * Math.sqrt(12) : 0;

  const calmar = mddPct > 0 ? cagr / mddPct : 0;

  return { totalReturn, cagr, mdd: mddPct, sharpe, calmar };
}

export async function GET(req: NextRequest) {
  const sp       = new URL(req.url).searchParams;
  const period   = sp.get("period") ?? "5y";
  const trigger  = sp.get("trigger") ?? "vix";  // vix | fear

  const [spxData, vixData] = await Promise.all([
    fetchMonthlyClose("^GSPC", period),
    fetchMonthlyClose("^VIX", period),
  ]);

  if (spxData.length < 12) {
    return NextResponse.json({ error: "데이터 부족" }, { status: 500 });
  }

  // SPX 월간 수익률
  const spxReturns: { date: string; ret: number }[] = [];
  for (let i = 1; i < spxData.length; i++) {
    spxReturns.push({
      date: spxData[i].date,
      ret: spxData[i].close / spxData[i - 1].close - 1,
    });
  }

  // VIX 맵 (월별)
  const vixMap = new Map(vixData.map(d => [d.date, d.close]));

  // 기준선: 100% 투자 (바이앤홀드)
  const baselineRets = spxReturns.map(d => d.ret);
  const baseline = calcMetrics(baselineRets);

  // VIX 트리거 값 범위
  const VIX_TRIGGERS = [15, 18, 20, 22, 25, 28, 30, 35];
  // 현금 비율 범위
  const CASH_RATIOS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

  const cells: CashOptCell[] = [];

  for (const vixTrigger of VIX_TRIGGERS) {
    for (const cashRatio of CASH_RATIOS) {
      if (cashRatio === 0) {
        // 0% 현금 = 바이앤홀드와 동일
        const m = calcMetrics(baselineRets);
        cells.push({ vixTrigger, cashRatio, ...m });
        continue;
      }
      // 각 월: VIX > trigger면 현금 cashRatio%, 나머지 시장 투자
      const adjReturns = spxReturns.map(d => {
        const vix = vixMap.get(d.date) ?? vixMap.get(d.date.slice(0, 7)) ?? 20;
        const inCash = vix > vixTrigger;
        if (inCash) {
          // 현금 cashRatio%, 나머지 spx에 투자
          return d.ret * (1 - cashRatio / 100);
        }
        return d.ret;  // 시장 정상 → 풀투자
      });
      const m = calcMetrics(adjReturns);
      cells.push({ vixTrigger, cashRatio, ...m });
    }
  }

  const bestByCalmar = cells.reduce((a, b) => (b.calmar > a.calmar ? b : a));
  const bestBySharpe = cells.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));

  return NextResponse.json({
    cells,
    baseline,
    bestByCalmar,
    bestBySharpe,
    period,
    trigger,
    startDate: spxReturns[0]?.date ?? "",
    endDate: spxReturns[spxReturns.length - 1]?.date ?? "",
  } satisfies CashOptResult);
}
