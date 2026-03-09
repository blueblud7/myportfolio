import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const INDICES = [
  { key: "nasdaq",  symbol: "^IXIC",      label: "NASDAQ",   isYield: false },
  { key: "sp500",   symbol: "^GSPC",      label: "S&P 500",  isYield: false },
  { key: "kospi",   symbol: "^KS11",      label: "KOSPI",    isYield: false },
  { key: "gold",    symbol: "GC=F",       label: "Gold",     isYield: false },
  { key: "btc",     symbol: "BTC-USD",    label: "BTC/USD",  isYield: false },
  { key: "wti",     symbol: "CL=F",       label: "WTI유가",  isYield: false },
  { key: "us10y",   symbol: "^TNX",       label: "US 10Y",   isYield: true  },
  { key: "kr10y",   symbol: "KR10YT=RR",  label: "KR 10Y",   isYield: true  },
];

// WTI 다음 달 선물 심볼 계산 (콘탱고/백워데이션용)
const MONTH_CODES = ["F","G","H","J","K","M","N","Q","U","V","X","Z"];
function getNextWtiSymbols(): [string, string] {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const m1 = (m + 1) % 12, y1 = y + Math.floor((m + 1) / 12);
  const m2 = (m + 2) % 12, y2 = y + Math.floor((m + 2) / 12);
  return [
    `CL${MONTH_CODES[m1]}${String(y1).slice(2)}.NYM`,
    `CL${MONTH_CODES[m2]}${String(y2).slice(2)}.NYM`,
  ];
}

export async function GET() {
  const [frontSym, nextSym] = getNextWtiSymbols();

  const [indexResults, oilFront, oilNext] = await Promise.all([
    Promise.allSettled(
      INDICES.map(async (idx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = await yf.quote(idx.symbol);
        return {
          key: idx.key,
          label: idx.label,
          symbol: idx.symbol,
          isYield: idx.isYield,
          price: q?.regularMarketPrice ?? null,
          change: q?.regularMarketChange ?? null,
          changePct: q?.regularMarketChangePercent ?? null,
          currency: q?.currency ?? "USD",
          prevClose: q?.regularMarketPreviousClose ?? null,
          oilSpread: null as number | null,
          oilCurve: null as "contango" | "backwardation" | null,
        };
      })
    ),
    yf.quote(frontSym).catch(() => null),
    yf.quote(nextSym).catch(() => null),
  ]);

  // 콘탱고/백워데이션 계산
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frontPrice: number | null = (oilFront as any)?.regularMarketPrice ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextPrice: number | null  = (oilNext as any)?.regularMarketPrice ?? null;
  let oilSpread: number | null = null;
  let oilCurve: "contango" | "backwardation" | null = null;
  if (frontPrice && nextPrice) {
    oilSpread = Math.round((nextPrice - frontPrice) * 100) / 100;
    oilCurve = oilSpread > 0 ? "contango" : "backwardation";
  }

  const data = indexResults.map((r, i) => {
    const base = r.status === "fulfilled"
      ? r.value
      : { key: INDICES[i].key, label: INDICES[i].label, symbol: INDICES[i].symbol, isYield: INDICES[i].isYield, price: null, change: null, changePct: null, currency: "USD", prevClose: null, oilSpread: null, oilCurve: null };
    if (base.key === "wti") return { ...base, oilSpread, oilCurve };
    return base;
  });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
