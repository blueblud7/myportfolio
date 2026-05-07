import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol, isKoreanTicker } from "@/lib/ticker-resolver";
import dartCorpCodes from "@/lib/dart-corp-codes.json";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const DART_KEY = process.env.DART_API_KEY ?? "";

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

// ─── 캐시 TTL ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15분

function nullNum(val: number | null | undefined): number | null { return val ?? null; }
function pct(val: number | null | undefined): number | null {
  return val == null ? null : val * 100;
}

// ─── 네이버 파이낸스 ───────────────────────────────────────────────────────────
const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Referer": "https://m.stock.naver.com/",
};

// "41.36배" → 41.36 / "6,564원" → 6564 / "0.61%" → 0.61
function parseNaverValue(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[,배원%조억만\s]/g, ""));
  return isNaN(n) ? null : n;
}

interface NaverTotalInfo { code: string; key: string; value: string }

async function fetchNaverIntegration(code: string): Promise<Map<string, string>> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers: NAVER_HEADERS });
    if (!res.ok) return new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const infos: NaverTotalInfo[] = data?.totalInfos ?? [];
    return new Map(infos.map((i) => [i.code, i.value]));
  } catch { return new Map(); }
}

// ─── DART API ────────────────────────────────────────────────────────────────

interface DartFsItem {
  sj_div: string;      // "IS" | "BS"
  account_id: string;
  account_nm: string;
  thstrm_nm: string;   // 당기 연도명 (e.g. "제 56 기")
  thstrm_dt: string;   // 당기 결산일 (e.g. "2024.12.31")
  thstrm_amount: string;
  frmtrm_dt: string;
  frmtrm_amount: string;
  bfefrmtrm_dt: string;
  bfefrmtrm_amount: string;
}

function parseDartAmount(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseInt(v.replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

function dartDate(dt: string | undefined): string {
  if (!dt) return "";
  // "2024.12.31" → "2024-12"
  return dt.slice(0, 7).replace(".", "-");
}

async function fetchDartFinancials(stockCode: string): Promise<{
  incomeStatement: StockDetailResponse["incomeStatement"];
  balanceSheet: StockDetailResponse["balanceSheet"];
  grossMargins: number | null;
} | null> {
  if (!DART_KEY) return null;

  const corpCode = (dartCorpCodes as Record<string, string>)[stockCode];
  if (!corpCode) return null;

  const currentYear = new Date().getFullYear();

  // 4개 조합을 동시에 시도, 우선순위 순으로 첫 번째 성공한 것 사용
  const combos: [number, string][] = [
    [currentYear - 1, "CFS"],
    [currentYear - 1, "OFS"],
    [currentYear - 2, "CFS"],
    [currentYear - 2, "OFS"],
  ];

  const fetchCombo = async (year: number, fsDiv: string) => {
    const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${DART_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011&fs_div=${fsDiv}`;
    const res = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data?.status === "000" && Array.isArray(data.list) && data.list.length > 0) {
      return { items: data.list as DartFsItem[], usedYear: year };
    }
    throw new Error(`no data`);
  };

  const results = await Promise.allSettled(combos.map(([y, d]) => fetchCombo(y, d)));
  const found = results.find((r): r is PromiseFulfilledResult<{ items: DartFsItem[]; usedYear: number }> => r.status === "fulfilled");
  if (!found) return null;

  const { items, usedYear } = found.value;
  if (!items) return null;

  // IS와 CIS 둘 다 검색 (회사마다 다름)
  const isItems = items.filter((i) => i.sj_div === "IS" || i.sj_div === "CIS");
  const byId = (id: string) => isItems.find((i) => i.account_id === id);
  const byNm = (nm: string) => isItems.find((i) => i.account_nm.includes(nm));

  // ── 손익계산서 ──
  const revenue     = byId("ifrs-full_Revenue")                       ?? byNm("매출액");
  const opIncome    = byId("dart_OperatingIncomeLoss")                ?? byNm("영업이익");
  const netIncome   = byId("ifrs-full_ProfitLoss")                    ?? byNm("당기순이익");
  const epsItem     = byId("ifrs-full_BasicEarningsLossPerShare")     ?? byNm("기본주당이익");
  const grossProfit = byId("ifrs-full_GrossProfit")                   ?? byNm("매출총이익");

  // thstrm_dt가 null인 경우 usedYear 기반으로 날짜 생성
  const makeDates = () => [
    `${usedYear}-12`,
    `${usedYear - 1}-12`,
    `${usedYear - 2}-12`,
  ];
  const dates = revenue?.thstrm_dt
    ? [dartDate(revenue.thstrm_dt), dartDate(revenue.frmtrm_dt), dartDate(revenue.bfefrmtrm_dt)]
    : makeDates();

  const incomeRows = [
    {
      date:      dates[0],
      revenue:   parseDartAmount(revenue?.thstrm_amount),
      netIncome: parseDartAmount(netIncome?.thstrm_amount),
      ebitda:    parseDartAmount(opIncome?.thstrm_amount),
      eps:       parseDartAmount(epsItem?.thstrm_amount),
    },
    {
      date:      dates[1],
      revenue:   parseDartAmount(revenue?.frmtrm_amount),
      netIncome: parseDartAmount(netIncome?.frmtrm_amount),
      ebitda:    parseDartAmount(opIncome?.frmtrm_amount),
      eps:       parseDartAmount(epsItem?.frmtrm_amount),
    },
    {
      date:      dates[2],
      revenue:   parseDartAmount(revenue?.bfefrmtrm_amount),
      netIncome: parseDartAmount(netIncome?.bfefrmtrm_amount),
      ebitda:    parseDartAmount(opIncome?.bfefrmtrm_amount),
      eps:       parseDartAmount(epsItem?.bfefrmtrm_amount),
    },
  ].filter((r) => r.date && r.revenue != null);

  // 매출총이익률
  const gp0 = parseDartAmount(grossProfit?.thstrm_amount);
  const rv0 = parseDartAmount(revenue?.thstrm_amount);
  const grossMarginsCalc = gp0 != null && rv0 != null && rv0 !== 0 ? (gp0 / rv0) * 100 : null;

  // ── 재무상태표 ──
  const bsItems = items.filter((i) => i.sj_div === "BS");
  const bsById = (id: string) => bsItems.find((i) => i.account_id === id);
  const bsByNm = (nm: string) => bsItems.find((i) => i.account_nm.includes(nm));

  const assets   = bsById("ifrs-full_Assets")                  ?? bsByNm("자산총계");
  const liab     = bsById("ifrs-full_Liabilities")             ?? bsByNm("부채총계");
  const cash     = bsById("ifrs-full_CashAndCashEquivalents")  ?? bsByNm("현금및현금성자산");
  const equity   = bsById("ifrs-full_Equity")                  ?? bsByNm("자본총계");
  const ltDebt   = bsById("ifrs-full_NoncurrentLiabilities")   ?? bsByNm("비유동부채");

  // BS 날짜도 thstrm_dt가 null일 수 있으므로 같은 dates 배열 사용
  const bsDates = assets?.thstrm_dt
    ? [dartDate(assets.thstrm_dt), dartDate(assets.frmtrm_dt), dartDate(assets.bfefrmtrm_dt)]
    : makeDates();

  const bsRows = [
    {
      date: bsDates[0],
      totalAssets:        parseDartAmount(assets?.thstrm_amount),
      totalDebt:          parseDartAmount(ltDebt?.thstrm_amount),
      cash:               parseDartAmount(cash?.thstrm_amount),
      stockholdersEquity: parseDartAmount(equity?.thstrm_amount),
    },
    {
      date: bsDates[1],
      totalAssets:        parseDartAmount(assets?.frmtrm_amount),
      totalDebt:          parseDartAmount(ltDebt?.frmtrm_amount),
      cash:               parseDartAmount(cash?.frmtrm_amount),
      stockholdersEquity: parseDartAmount(equity?.frmtrm_amount),
    },
    {
      date: bsDates[2],
      totalAssets:        parseDartAmount(assets?.bfefrmtrm_amount),
      totalDebt:          parseDartAmount(ltDebt?.bfefrmtrm_amount),
      cash:               parseDartAmount(cash?.bfefrmtrm_amount),
      stockholdersEquity: parseDartAmount(equity?.bfefrmtrm_amount),
    },
  ].filter((r) => r.date && r.totalAssets != null);

  return {
    incomeStatement: incomeRows as StockDetailResponse["incomeStatement"],
    balanceSheet: bsRows as StockDetailResponse["balanceSheet"],
    grossMargins: grossMarginsCalc,
  };
}

// ─── 한국 주식 fetch ──────────────────────────────────────────────────────────
async function fetchKoreanStockDetail(code: string, ticker: string): Promise<StockDetailResponse | null> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // KS/KQ 동시 시도 + Naver + DART 모두 병렬로 시작 (심볼 확정 전에도 가능)
  const [[ksResult, kqResult], naverMap, dartData] = await Promise.all([
    Promise.allSettled([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yf.quote(`${code}.KS`) as Promise<any>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yf.quote(`${code}.KQ`) as Promise<any>,
    ]),
    fetchNaverIntegration(code),
    fetchDartFinancials(code),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quoteResult: any = null;
  let usedSymbol = `${code}.KS`;

  if (ksResult.status === "fulfilled" && ksResult.value?.regularMarketPrice) {
    quoteResult = ksResult.value;
    usedSymbol = `${code}.KS`;
  } else if (kqResult.status === "fulfilled" && kqResult.value?.regularMarketPrice) {
    quoteResult = kqResult.value;
    usedSymbol = `${code}.KQ`;
  }

  if (!quoteResult?.regularMarketPrice) return null;

  // 심볼 확정 후 summary + chart 병렬
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summaryResult, chartResult] = await Promise.all([
    yf.quoteSummary(usedSymbol, { modules: ["summaryDetail", "summaryProfile"] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch(() => ({} as any)),
    yf.chart(usedSymbol, { period1: oneYearAgo, period2: now, interval: "1d" })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch(() => ({ quotes: [] } as any)),
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

  // 네이버 밸류에이션 지표
  const per      = parseNaverValue(naverMap.get("per"));
  const pbr      = parseNaverValue(naverMap.get("pbr"));
  const eps      = parseNaverValue(naverMap.get("eps"));
  const bps      = parseNaverValue(naverMap.get("bps"));
  const divYield = parseNaverValue(naverMap.get("dividendYieldRatio"));
  const fwdPer   = parseNaverValue(naverMap.get("cnsPer"));
  const fwdEps   = parseNaverValue(naverMap.get("cnsEps"));
  const roe      = (eps != null && bps != null && bps !== 0) ? (eps / bps) * 100 : null;

  const incomeStatement = dartData?.incomeStatement ?? [];
  const balanceSheet    = dartData?.balanceSheet ?? [];

  let grossMargins:     number | null = dartData?.grossMargins ?? null;
  let operatingMargins: number | null = null;
  let profitMargins:    number | null = null;
  let returnOnAssets:   number | null = null;
  let revenueGrowth:    number | null = null;
  let earningsGrowth:   number | null = null;

  if (incomeStatement.length >= 1) {
    const latest = incomeStatement[0];
    if (latest.revenue && latest.ebitda)
      operatingMargins = (latest.ebitda / latest.revenue) * 100;
    if (latest.revenue && latest.netIncome)
      profitMargins = (latest.netIncome / latest.revenue) * 100;
  }
  if (incomeStatement.length >= 1 && balanceSheet.length >= 1) {
    const net = incomeStatement[0].netIncome;
    const assets = balanceSheet[0].totalAssets;
    if (net != null && assets != null && assets !== 0)
      returnOnAssets = (net / assets) * 100;
  }
  if (incomeStatement.length >= 2) {
    const [curr, prev] = incomeStatement;
    if (curr.revenue && prev.revenue && prev.revenue !== 0)
      revenueGrowth = ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100;
    if (curr.netIncome && prev.netIncome && prev.netIncome !== 0)
      earningsGrowth = ((curr.netIncome - prev.netIncome) / Math.abs(prev.netIncome)) * 100;
  }

  // 배당성향: (주당배당금 / EPS) × 100
  const divPerShare = parseNaverValue(naverMap.get("dividend"));
  const payoutRatio = divPerShare != null && eps != null && eps !== 0
    ? (divPerShare / eps) * 100 : null;

  return {
    ticker,
    symbol: usedSymbol,
    name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
    currency: "KRW",
    price: quoteResult.regularMarketPrice,
    changePct: quoteResult.regularMarketChangePercent ?? 0,
    fiftyTwoWeekLow:  parseNaverValue(naverMap.get("lowPriceOf52Weeks"))  ?? quoteResult.fiftyTwoWeekLow  ?? sd.fiftyTwoWeekLow  ?? 0,
    fiftyTwoWeekHigh: parseNaverValue(naverMap.get("highPriceOf52Weeks")) ?? quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
    trailingPE:   per,
    forwardPE:    fwdPer,
    pegRatio:     null,
    priceToBook:  pbr,
    priceToSales: null,
    evToEbitda:   null,
    grossMargins,
    operatingMargins,
    profitMargins,
    returnOnEquity:   roe,
    returnOnAssets,
    trailingEps: eps,
    forwardEps:  fwdEps,
    dividendYield: divYield,
    payoutRatio,
    revenueGrowth,
    earningsGrowth,
    beta:      nullNum(quoteResult.beta ?? sd.beta),
    marketCap: nullNum(quoteResult.marketCap),
    sector:   sp.sector ?? null,
    industry: sp.industry ?? null,
    description: sp.longBusinessSummary ?? null,
    chart,
    incomeStatement,
    balanceSheet,
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
      ticker, symbol,
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
  } catch { return null; }
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });

  const cacheKey = `stock-detail:${ticker}`;
  const cached = await getStockCache<StockDetailResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const data = isKoreanTicker(ticker)
    ? await fetchKoreanStockDetail(ticker, ticker)
    : await fetchStockDetail(resolveYahooSymbol(ticker), ticker);

  if (!data) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  await setStockCache(cacheKey, data, CACHE_TTL_MS);
  return NextResponse.json(data);
}
