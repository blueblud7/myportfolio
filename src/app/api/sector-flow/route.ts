import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface SectorItem {
  key: string;
  name: string;
  ticker: string;
  changePct: number | null;
  price: number | null;
}

export interface SectorFlowResponse {
  us: SectorItem[];
  kr: SectorItem[];
  period: string;
  updatedAt: string;
}

const US_SECTORS = [
  { key: "tech",       name: "기술 (Tech)",         ticker: "XLK"  },
  { key: "finance",    name: "금융 (Finance)",       ticker: "XLF"  },
  { key: "energy",     name: "에너지 (Energy)",      ticker: "XLE"  },
  { key: "health",     name: "헬스케어 (Health)",    ticker: "XLV"  },
  { key: "industrial", name: "산업재 (Industrial)",  ticker: "XLI"  },
  { key: "comm",       name: "통신 (Comm)",          ticker: "XLC"  },
  { key: "consumer_d", name: "경기소비재 (Discret.)",ticker: "XLY"  },
  { key: "consumer_s", name: "필수소비재 (Staples)", ticker: "XLP"  },
  { key: "materials",  name: "소재 (Materials)",     ticker: "XLB"  },
  { key: "utilities",  name: "유틸리티 (Utilities)", ticker: "XLU"  },
  { key: "realestate", name: "부동산 (RE)",          ticker: "XLRE" },
];

const KR_SECTORS = [
  { key: "semi",    name: "반도체",      ticker: "091160.KS" }, // KODEX 반도체
  { key: "bank",    name: "은행",        ticker: "091170.KS" }, // KODEX 은행
  { key: "auto",    name: "자동차",      ticker: "091180.KS" }, // KODEX 자동차
  { key: "energy",  name: "에너지/화학", ticker: "117460.KS" }, // KODEX 에너지화학
  { key: "steel",   name: "철강/소재",   ticker: "117480.KS" }, // KODEX 철강
  { key: "health",  name: "헬스케어",    ticker: "227540.KS" }, // TIGER 헬스케어
  { key: "finance", name: "금융",        ticker: "139270.KS" }, // TIGER 200 금융
  { key: "bio",     name: "바이오",      ticker: "244580.KS" }, // KODEX 바이오
];

function getPeriodStart(period: string): string {
  const now = new Date();
  const d = new Date(now);
  if (period === "1W") d.setDate(d.getDate() - 7);
  else if (period === "1M") d.setMonth(d.getMonth() - 1);
  else if (period === "3M") d.setMonth(d.getMonth() - 3);
  else if (period === "YTD") { d.setMonth(0); d.setDate(1); }
  else d.setMonth(d.getMonth() - 1); // default 1M
  return d.toISOString().split("T")[0];
}

async function fetchSectorChange(
  ticker: string,
  period1: string,
  period2: string
): Promise<{ changePct: number | null; price: number | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart: any = await yf.chart(ticker, { period1, period2, interval: "1d" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const closes: number[] = (chart?.quotes ?? []).filter((q: any) => q.close != null).map((q: any) => q.close as number);
    if (closes.length < 2) return { changePct: null, price: closes[closes.length - 1] ?? null };
    const first = closes[0];
    const last = closes[closes.length - 1];
    return { changePct: ((last - first) / first) * 100, price: last };
  } catch {
    return { changePct: null, price: null };
  }
}

// 30분 in-memory cache per period
const cache: Record<string, { data: SectorFlowResponse; ts: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const period = (req.nextUrl.searchParams.get("period") ?? "1M").toUpperCase();

  if (cache[period] && Date.now() - cache[period].ts < CACHE_TTL) {
    return NextResponse.json(cache[period].data);
  }

  const today = new Date().toISOString().split("T")[0];
  const period1 = getPeriodStart(period);

  const [usResults, krResults] = await Promise.all([
    Promise.allSettled(
      US_SECTORS.map((s) => fetchSectorChange(s.ticker, period1, today).then((r) => ({ ...s, ...r })))
    ),
    Promise.allSettled(
      KR_SECTORS.map((s) => fetchSectorChange(s.ticker, period1, today).then((r) => ({ ...s, ...r })))
    ),
  ]);

  const toItems = (
    results: PromiseSettledResult<{ key: string; name: string; ticker: string; changePct: number | null; price: number | null }>[]
  ): SectorItem[] =>
    results
      .map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { key: "", name: "", ticker: "", changePct: null, price: null }
      )
      .filter((r) => r.key)
      .sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));

  const data: SectorFlowResponse = {
    us: toItems(usResults),
    kr: toItems(krResults),
    period,
    updatedAt: new Date().toISOString(),
  };

  cache[period] = { data, ts: Date.now() };
  return NextResponse.json(data);
}
