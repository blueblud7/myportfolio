import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface PCRData {
  symbol: string;
  pcr: number | null;
  callVolume: number;
  putVolume: number;
  basis: "volume" | "openInterest";
}

export interface PCRHistoryPoint {
  date: string;
  pcr: number;
}

export interface PCRResponse {
  current: PCRData[];
  history: PCRHistoryPoint[];
}

async function getSymbolPCR(symbol: string): Promise<PCRData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yf.options(symbol, {}, { validateResult: false });
  const chain = result?.options?.[0];

  if (!chain) {
    return { symbol, pcr: null, callVolume: 0, putVolume: 0, basis: "volume" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callVol = (chain.calls || []).reduce((s: number, c: any) => s + (c.volume ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const putVol = (chain.puts || []).reduce((s: number, p: any) => s + (p.volume ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callOI = (chain.calls || []).reduce((s: number, c: any) => s + (c.openInterest ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const putOI = (chain.puts || []).reduce((s: number, p: any) => s + (p.openInterest ?? 0), 0);

  const useVol = callVol + putVol > 0;
  const callVal = useVol ? callVol : callOI;
  const putVal = useVol ? putVol : putOI;
  const pcr = callVal > 0 ? putVal / callVal : null;

  return {
    symbol,
    pcr,
    callVolume: callVal,
    putVolume: putVal,
    basis: useVol ? "volume" : "openInterest",
  };
}

async function getPCRHistory(): Promise<PCRHistoryPoint[]> {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);

  try {
    // ^PCCE = CBOE Equity Put/Call Ratio (Yahoo Finance 제공 히스토리)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await yf.historical(
      "^PCCE",
      { period1: start.toISOString().slice(0, 10), period2: end.toISOString().slice(0, 10) },
      { validateResult: false }
    );

    return rows
      .filter((r) => r.close != null)
      .map((r) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        pcr: parseFloat(r.close.toFixed(3)),
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [spy, qqq, kospi, history] = await Promise.allSettled([
      getSymbolPCR("SPY"),
      getSymbolPCR("QQQ"),
      getSymbolPCR("069500.KS"), // KODEX 200 (KOSPI 200 ETF)
      getPCRHistory(),
    ]);

    const current: PCRData[] = [];
    if (spy.status === "fulfilled") current.push(spy.value);
    if (qqq.status === "fulfilled") current.push(qqq.value);
    if (kospi.status === "fulfilled" && kospi.value.pcr !== null) {
      current.push({ ...kospi.value, symbol: "KOSPI200" });
    }

    const historyData =
      history.status === "fulfilled" ? history.value : [];

    const response: PCRResponse = { current, history: historyData };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
