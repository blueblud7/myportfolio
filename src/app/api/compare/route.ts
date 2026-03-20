import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { isKoreanTicker } from "@/lib/ticker-resolver";

const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

interface SeriesData {
  name: string;
  currency: string;
  quotes: { date: string; close: number }[];
}

const PERIOD_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
};

function getPeriodStart(period: string): Date {
  const d = new Date();
  d.setDate(d.getDate() - (PERIOD_DAYS[period] ?? 365));
  return d;
}

async function fetchSeries(
  rawTicker: string,
  period1: string,
  period2: string
): Promise<SeriesData | null> {
  const symbols = isKoreanTicker(rawTicker)
    ? [`${rawTicker}.KS`, `${rawTicker}.KQ`]
    : [rawTicker];

  let bestChart: any = null;
  let bestQuote: any = null;
  let bestCount = 0;

  for (const sym of symbols) {
    try {
      const [chart, quote] = await Promise.all([
        yf.chart(sym, { period1, period2, interval: "1d" }),
        yf.quote(sym),
      ]);
      const count =
        chart?.quotes?.filter((q: any) => q.close != null).length ?? 0;
      if (count > bestCount) {
        bestChart = chart;
        bestQuote = quote;
        bestCount = count;
      }
    } catch {
      continue;
    }
  }

  if (!bestChart || bestCount < 5) return null;

  const quotes = bestChart.quotes.filter((q: any) => q.close != null);
  return {
    name: bestQuote?.shortName ?? bestQuote?.longName ?? rawTicker,
    currency: bestQuote?.currency ?? (isKoreanTicker(rawTicker) ? "KRW" : "USD"),
    quotes: quotes.map((q: any) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      close: q.close as number,
    })),
  };
}

export interface ComparePoint {
  date: string;
  aIndexed: number;
  bIndexed: number;
  ratio: number;
}

export interface PerfStat {
  a: number;
  b: number;
  diff: number;
  leader: "a" | "b" | "tie";
}

export interface CompareResult {
  a: { ticker: string; name: string; currency: string };
  b: { ticker: string; name: string; currency: string };
  period: string;
  series: ComparePoint[];
  performance: Record<string, PerfStat>;
  correlation: number;
  beta: number;
  currentRatio: number;
  leader: "a" | "b" | "tie";
  totalReturnA: number;
  totalReturnB: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tickerA = (searchParams.get("a") ?? "QQQ").toUpperCase();
  const tickerB = (searchParams.get("b") ?? "VOO").toUpperCase();
  const period = searchParams.get("period") ?? "1y";

  const start = getPeriodStart(period);
  const period1 = start.toISOString().split("T")[0];
  const period2 = new Date().toISOString().split("T")[0];

  const [dataA, dataB] = await Promise.all([
    fetchSeries(tickerA, period1, period2),
    fetchSeries(tickerB, period1, period2),
  ]);

  if (!dataA)
    return NextResponse.json(
      { error: `${tickerA} 데이터를 찾을 수 없습니다.` },
      { status: 404 }
    );
  if (!dataB)
    return NextResponse.json(
      { error: `${tickerB} 데이터를 찾을 수 없습니다.` },
      { status: 404 }
    );

  const dateSetA = new Map(dataA.quotes.map((q) => [q.date, q.close]));
  const dateSetB = new Map(dataB.quotes.map((q) => [q.date, q.close]));
  const commonDates = dataA.quotes
    .map((q) => q.date)
    .filter((d) => dateSetB.has(d))
    .sort();

  if (commonDates.length < 5) {
    return NextResponse.json(
      { error: "공통 거래일이 충분하지 않습니다." },
      { status: 400 }
    );
  }

  const pricesA = commonDates.map((d) => dateSetA.get(d)!);
  const pricesB = commonDates.map((d) => dateSetB.get(d)!);

  const baseA = pricesA[0];
  const baseB = pricesB[0];

  const series: ComparePoint[] = commonDates.map((date, i) => {
    const aIdx = Math.round((pricesA[i] / baseA) * 10000) / 100;
    const bIdx = Math.round((pricesB[i] / baseB) * 10000) / 100;
    return {
      date,
      aIndexed: aIdx,
      bIndexed: bIdx,
      ratio: Math.round((aIdx / bIdx) * 1000) / 1000,
    };
  });

  const perfPeriods: Record<string, number> = {
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "1y": 252,
    all: commonDates.length,
  };
  const performance: Record<string, PerfStat> = {};
  for (const [label, days] of Object.entries(perfPeriods)) {
    const idx = Math.max(0, pricesA.length - days);
    if (idx >= pricesA.length - 1) continue;
    const a =
      Math.round(
        ((pricesA[pricesA.length - 1] - pricesA[idx]) / pricesA[idx]) * 10000
      ) / 100;
    const b =
      Math.round(
        ((pricesB[pricesB.length - 1] - pricesB[idx]) / pricesB[idx]) * 10000
      ) / 100;
    const diff = Math.round((a - b) * 100) / 100;
    performance[label] = {
      a,
      b,
      diff,
      leader: diff > 0.1 ? "a" : diff < -0.1 ? "b" : "tie",
    };
  }

  const retA = pricesA.slice(1).map((p, i) => (p - pricesA[i]) / pricesA[i]);
  const retB = pricesB.slice(1).map((p, i) => (p - pricesB[i]) / pricesB[i]);
  const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
  const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
  const covAB =
    retA.reduce((s, v, i) => s + (v - meanA) * (retB[i] - meanB), 0) /
    retA.length;
  const varA =
    retA.reduce((s, v) => s + (v - meanA) ** 2, 0) / retA.length;
  const varB =
    retB.reduce((s, v) => s + (v - meanB) ** 2, 0) / retB.length;
  const correlation =
    Math.round((covAB / Math.sqrt(varA * varB)) * 1000) / 1000;
  const beta = Math.round((covAB / varB) * 1000) / 1000;

  const totalReturnA =
    Math.round(
      ((pricesA[pricesA.length - 1] - baseA) / baseA) * 10000
    ) / 100;
  const totalReturnB =
    Math.round(
      ((pricesB[pricesB.length - 1] - baseB) / baseB) * 10000
    ) / 100;
  const currentRatio = series[series.length - 1].ratio;
  const leader: CompareResult["leader"] =
    totalReturnA > totalReturnB + 0.1
      ? "a"
      : totalReturnA < totalReturnB - 0.1
      ? "b"
      : "tie";

  return NextResponse.json({
    a: { ticker: tickerA, name: dataA.name, currency: dataA.currency },
    b: { ticker: tickerB, name: dataB.name, currency: dataB.currency },
    period,
    series,
    performance,
    correlation,
    beta,
    currentRatio,
    leader,
    totalReturnA,
    totalReturnB,
  } satisfies CompareResult);
}
