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

export async function GET() {
  try {
    const [spy, qqq] = await Promise.all([
      getSymbolPCR("SPY"),
      getSymbolPCR("QQQ"),
    ]);

    return NextResponse.json([spy, qqq], {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
