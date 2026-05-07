import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol, isKoreanTicker } from "@/lib/ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface StockDetailResponse {
  ticker: string;
  symbol: string;
  name: string;
  currency: string;
  price: number;
  changePct: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  chart: { date: string; close: number; volume: number }[];
  incomeStatement: {
    date: string;
    revenue: number | null;
    netIncome: number | null;
    ebitda: number | null;
    eps: number | null;
  }[];
  balanceSheet: {
    date: string;
    totalAssets: number | null;
    totalDebt: number | null;
    cash: number | null;
    stockholdersEquity: number | null;
  }[];
}

// ─── 캐시 ────────────────────────────────────────────────────────────────────
interface CacheEntry { data: StockDetailResponse; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function pct(val: number | null | undefined): number | null {
  return val == null ? null : val * 100;
}
function nullNum(val: number | null | undefined): number | null {
  return val ?? null;
}

// ─── 네이버 파이낸스 (한국 주식) ──────────────────────────────────────────────

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Referer": "https://m.stock.naver.com/",
};

// "41.36배" → 41.36 / "6,564원" → 6564 / "0.61%" → 0.61
function parseNaverValue(v: string | undefined | null): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[,배원%조억만\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

interface NaverTotalInfo { code: string; key: string; value: string; valueDesc?: string }

async function fetchNaverIntegration(code: string): Promise<NaverTotalInfo[]> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/integration`,
      { headers: NAVER_HEADERS }
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return (data?.totalInfos ?? []) as NaverTotalInfo[];
  } catch { return []; }
}

// finance/summary → chartIncomeStatement.annual.columns
// columns: [["x", "2023.12.", ...], ["매출액", val1, val2, ...], ["영업이익", ...]]
// 단위: 억원
interface NaverIncomeRow {
  date: string;    // "2023.12."
  revenue: number | null;       // 억원
  operatingIncome: number | null; // 억원
  isConsensus: boolean;
}

async function fetchNaverIncomeSummary(code: string): Promise<NaverIncomeRow[]> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/finance/summary`,
      { headers: NAVER_HEADERS }
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const annual = data?.chartIncomeStatement?.annual ?? {};
    const cols: string[][] = annual.columns ?? [];
    const titleList: { isConsensus: string; title: string }[] = annual.trTitleList ?? [];

    if (cols.length < 2) return [];

    const dates: string[]   = cols[0].slice(1); // ["2023.12.", ...]
    const revenues: string[] = (cols.find((c) => c[0] === "매출액")  ?? []).slice(1);
    const opincome: string[] = (cols.find((c) => c[0] === "영업이익") ?? []).slice(1);

    return dates.map((d, i) => ({
      date: d,
      revenue:        revenues[i] ? parseFloat(revenues[i].replace(/,/g, "")) : null,
      operatingIncome: opincome[i] ? parseFloat(opincome[i].replace(/,/g, "")) : null,
      isConsensus: titleList[i]?.isConsensus === "Y",
    }));
  } catch { return []; }
}

// ─── 한국 주식 fetch ──────────────────────────────────────────────────────────
async function fetchKoreanStockDetail(code: string, ticker: string): Promise<StockDetailResponse | null> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Yahoo Finance (가격 + 차트) + 네이버 (재무지표) 병렬 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quoteResult: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summaryResult: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartResult: any = null;
  let usedSymbol = `${code}.KS`;

  for (const suffix of [".KS", ".KQ"]) {
    const sym = `${code}${suffix}`;
    try {
      const q = await yf.quote(sym);
      if (q?.regularMarketPrice) {
        quoteResult = q;
        usedSymbol = sym;
        [summaryResult, chartResult] = await Promise.all([
          yf.quoteSummary(sym, { modules: ["summaryDetail", "summaryProfile"] })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch(() => ({} as any)),
          yf.chart(sym, { period1: oneYearAgo, period2: now, interval: "1d" })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch(() => ({ quotes: [] } as any)),
        ]);
        break;
      }
    } catch { /* try next suffix */ }
  }

  if (!quoteResult?.regularMarketPrice) return null;

  // 네이버 병렬 조회
  const [naverInfos, naverIncome] = await Promise.all([
    fetchNaverIntegration(code),
    fetchNaverIncomeSummary(code),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd: any = summaryResult?.summaryDetail ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp: any = summaryResult?.summaryProfile ?? {};

  // 차트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes: any[] = chartResult?.quotes ?? [];
  const chart = quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      close: q.close as number,
      volume: (q.volume as number) ?? 0,
    }));

  // 네이버 totalInfos → code 기준 조회
  const infoMap = new Map(naverInfos.map((i) => [i.code, i.value]));
  const per = parseNaverValue(infoMap.get("per"));
  const pbr = parseNaverValue(infoMap.get("pbr"));
  const eps = parseNaverValue(infoMap.get("eps"));
  const bps = parseNaverValue(infoMap.get("bps"));
  const divYield = parseNaverValue(infoMap.get("dividendYieldRatio"));
  const forwardPer = parseNaverValue(infoMap.get("cnsPer"));
  const forwardEps = parseNaverValue(infoMap.get("cnsEps"));

  // ROE 근사: EPS / BPS * 100
  const roe = (eps != null && bps != null && bps !== 0) ? (eps / bps) * 100 : null;

  // 네이버 손익계산서 (억원 × 1e8 = 원)
  const OEK = 1e8;
  const confirmedIncome = naverIncome.filter((r) => !r.isConsensus);

  const incomeStatement = confirmedIncome
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((r) => ({
      date: r.date.replace(".", "-").replace(".", ""), // "2024.12." → "2024-12"
      revenue: r.revenue != null ? r.revenue * OEK : null,
      netIncome: null as number | null,
      ebitda: r.operatingIncome != null ? r.operatingIncome * OEK : null,
      eps: null as number | null,
    }));

  // 영업이익률, 매출성장
  let operatingMargins: number | null = null;
  let revenueGrowth: number | null = null;

  if (confirmedIncome.length >= 1 && confirmedIncome[confirmedIncome.length - 1].revenue && confirmedIncome[confirmedIncome.length - 1].operatingIncome) {
    const latest = confirmedIncome.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest.revenue && latest.operatingIncome)
      operatingMargins = (latest.operatingIncome / latest.revenue) * 100;
  }
  if (confirmedIncome.length >= 2) {
    const sorted = [...confirmedIncome].sort((a, b) => b.date.localeCompare(a.date));
    const [curr, prev] = sorted;
    if (curr.revenue && prev.revenue && prev.revenue !== 0)
      revenueGrowth = ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100;
  }

  return {
    ticker,
    symbol: usedSymbol,
    name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
    currency: "KRW",
    price: quoteResult.regularMarketPrice,
    changePct: quoteResult.regularMarketChangePercent ?? 0,
    fiftyTwoWeekLow:  parseNaverValue(infoMap.get("lowPriceOf52Weeks"))  ?? quoteResult.fiftyTwoWeekLow  ?? sd.fiftyTwoWeekLow  ?? 0,
    fiftyTwoWeekHigh: parseNaverValue(infoMap.get("highPriceOf52Weeks")) ?? quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
    trailingPE:   per,
    forwardPE:    forwardPer,
    pegRatio:     null,
    priceToBook:  pbr,
    priceToSales: null,
    evToEbitda:   null,
    grossMargins:     null,
    operatingMargins,
    profitMargins:    null,
    returnOnEquity:   roe,
    returnOnAssets:   null,
    trailingEps: eps,
    forwardEps:  forwardEps,
    dividendYield: divYield,
    payoutRatio:  null,
    revenueGrowth,
    earningsGrowth: null,
    beta: nullNum(quoteResult.beta ?? sd.beta),
    marketCap: nullNum(quoteResult.marketCap),
    sector:   sp.sector ?? null,
    industry: sp.industry ?? null,
    description: sp.longBusinessSummary ?? null,
    chart,
    incomeStatement,
    balanceSheet: [], // 네이버 API에서 대차대조표 엔드포인트 미지원
  };
}

// ─── 해외 주식 fetch ──────────────────────────────────────────────────────────
async function fetchStockDetail(symbol: string, ticker: string): Promise<StockDetailResponse | null> {
  try {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [quoteResult, summaryResult, chartResult, tsResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yf.quote(symbol) as Promise<any>,
      yf.quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail", "summaryProfile"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as Promise<any>,
      yf.chart(symbol, {
        period1: oneYearAgo, period2: now, interval: "1d",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as Promise<any>,
      Promise.all([
        yf.fundamentalsTimeSeries(symbol, { module: "financials",    type: "annual", period1: new Date(now.getFullYear() - 5, 0, 1) }),
        yf.fundamentalsTimeSeries(symbol, { module: "balance-sheet", type: "annual", period1: new Date(now.getFullYear() - 5, 0, 1) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]).catch(() => [[], []]) as Promise<any>,
    ]);

    if (!quoteResult?.regularMarketPrice) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fd: any = summaryResult?.financialData ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ks: any = summaryResult?.defaultKeyStatistics ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd: any = summaryResult?.summaryDetail ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp: any = summaryResult?.summaryProfile ?? {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = chartResult?.quotes ?? [];
    const chart = quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        date: new Date(q.date).toISOString().slice(0, 10),
        close: q.close as number,
        volume: (q.volume as number) ?? 0,
      }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tsArr: [any[], any[]] = Array.isArray(tsResult) && tsResult.length >= 2
      ? [tsResult[0], tsResult[1]] : [[], []];
    const [finRows, bsRows] = tsArr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRows = (r: any) => (Array.isArray(r) ? r : Object.values(r ?? {})) as any[];

    const incomeStatement = toRows(finRows)
      .filter((r) => r.totalRevenue)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((r) => ({
        date:      new Date(r.date).toISOString().slice(0, 7),
        revenue:   (r.totalRevenue as number | null) ?? null,
        netIncome: (r.netIncomeContinuousOperations ?? r.netIncome as number | null) ?? null,
        ebitda:    (r.ebitda as number | null) ?? null,
        eps:       (r.dilutedEPS ?? r.eps as number | null) ?? null,
      }));

    const balanceSheet = toRows(bsRows)
      .filter((r) => r.totalAssets)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((r) => ({
        date:               new Date(r.date).toISOString().slice(0, 7),
        totalAssets:        (r.totalAssets as number | null) ?? null,
        totalDebt:          (r.longTermDebt as number | null) ?? null,
        cash:               (r.cashAndCashEquivalents as number | null) ?? null,
        stockholdersEquity: (r.stockholdersEquity as number | null) ?? null,
      }));

    return {
      ticker,
      symbol,
      name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
      currency: quoteResult.currency ?? "USD",
      price: quoteResult.regularMarketPrice,
      changePct: quoteResult.regularMarketChangePercent ?? 0,
      fiftyTwoWeekLow:  quoteResult.fiftyTwoWeekLow  ?? sd.fiftyTwoWeekLow  ?? 0,
      fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
      trailingPE:  nullNum(sd.trailingPE  ?? quoteResult.trailingPE),
      forwardPE:   nullNum(sd.forwardPE   ?? quoteResult.forwardPE),
      pegRatio:    nullNum(ks.pegRatio),
      priceToBook: nullNum(ks.priceToBook ?? quoteResult.priceToBook),
      priceToSales: nullNum(ks.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
      evToEbitda:  nullNum(ks.enterpriseToEbitda),
      grossMargins:     pct(fd.grossMargins),
      operatingMargins: pct(fd.operatingMargins),
      profitMargins:    pct(fd.profitMargins),
      returnOnEquity:   pct(fd.returnOnEquity),
      returnOnAssets:   pct(fd.returnOnAssets),
      trailingEps: nullNum(ks.trailingEps ?? quoteResult.epsTrailingTwelveMonths),
      forwardEps:  nullNum(ks.forwardEps ?? fd.forwardEps ?? quoteResult.epsForward),
      dividendYield: pct(sd.dividendYield ?? sd.trailingAnnualDividendYield),
      payoutRatio:   pct(sd.payoutRatio),
      revenueGrowth:  fd.revenueGrowth  != null ? fd.revenueGrowth  * 100 : null,
      earningsGrowth: fd.earningsGrowth != null ? fd.earningsGrowth * 100 : null,
      beta:      nullNum(ks.beta ?? sd.beta),
      marketCap: nullNum(quoteResult.marketCap),
      sector:   sp.sector ?? null,
      industry: sp.industry ?? null,
      description: sp.longBusinessSummary ?? null,
      chart,
      incomeStatement,
      balanceSheet,
    };
  } catch {
    return null;
  }
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });

  const now = Date.now();
  const cached = cache.get(ticker);
  if (cached && cached.expiresAt > now) return NextResponse.json(cached.data);

  const data = isKoreanTicker(ticker)
    ? await fetchKoreanStockDetail(ticker, ticker)
    : await fetchStockDetail(resolveYahooSymbol(ticker), ticker);

  if (!data) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  cache.set(ticker, { data, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(data);
}
