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

// ─── 유틸 ────────────────────────────────────────────────────────────────────
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

// 억원 → 원 변환 (네이버 재무제표는 억원 단위)
const OEK = 1e8;

function parseNaverNum(v: string | undefined | null): number | null {
  if (!v || v === "N/A" || v === "-" || v.trim() === "") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

interface NaverInfo { fieldId?: string; title?: string; value?: string }

async function fetchNaverSummary(code: string): Promise<NaverInfo[]> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/finance/summary`,
      { headers: NAVER_HEADERS }
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return (data?.totalInfos ?? []) as NaverInfo[];
  } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNaverDetail(code: string, name: "income" | "balance"): Promise<any> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/finance/detail?type=annual&name=${name}`,
      { headers: NAVER_HEADERS }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function findNaverField(infos: NaverInfo[], ...ids: string[]): number | null {
  for (const id of ids) {
    const item = infos.find(
      (i) => i.fieldId === id || i.title?.toLowerCase().includes(id.toLowerCase())
    );
    if (item) {
      const n = parseNaverNum(item.value);
      if (n !== null) return n;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNaverAccount(accounts: any[], ...titles: string[]): number[] {
  for (const t of titles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = accounts.find((a: any) =>
      titles.some((tt) => (a.title ?? "").includes(tt))
    );
    if (acc) {
      void t; // suppress unused warning
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (acc.values ?? []).map((v: any) => (typeof v === "number" ? v : null));
    }
  }
  return [];
}

// ─── 한국 주식 fetch ──────────────────────────────────────────────────────────
async function fetchKoreanStockDetail(code: string, ticker: string): Promise<StockDetailResponse | null> {
  // Yahoo Finance (가격 + 차트 + 섹터) + 네이버 파이낸스 (재무지표) 병렬 조회
  const yfSymbols = [".KS", ".KQ"].map((s) => `${code}${s}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quoteResult: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summaryResult: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartResult: any = null;
  let usedSymbol = yfSymbols[0];

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (const sym of yfSymbols) {
    try {
      const q = await yf.quote(sym);
      if (q?.regularMarketPrice) {
        quoteResult = q;
        usedSymbol = sym;
        [summaryResult, chartResult] = await Promise.all([
          yf.quoteSummary(sym, {
            modules: ["summaryDetail", "summaryProfile"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }).catch(() => ({} as any)),
          yf.chart(sym, { period1: oneYearAgo, period2: now, interval: "1d" })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch(() => ({ quotes: [] }) as any),
        ]);
        break;
      }
    } catch { /* try next */ }
  }

  if (!quoteResult?.regularMarketPrice) return null;

  // 네이버 파이낸스 병렬 조회
  const [naverInfos, naverIncome, naverBalance] = await Promise.all([
    fetchNaverSummary(code),
    fetchNaverDetail(code, "income"),
    fetchNaverDetail(code, "balance"),
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

  // 네이버 재무지표 파싱
  const per  = findNaverField(naverInfos, "per");
  const pbr  = findNaverField(naverInfos, "pbr");
  const eps  = findNaverField(naverInfos, "eps");
  const roe  = findNaverField(naverInfos, "roe");
  const divRate = findNaverField(naverInfos, "dividendRate", "시가배당률");

  // 네이버 손익계산서 (억원 단위)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incAccounts: any[] = naverIncome?.financeInfo?.accounts ?? naverIncome?.accounts ?? [];
  const incDates: string[] = naverIncome?.financeInfo?.endDate ?? naverIncome?.endDate ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getAccount(titles: string[]): (number | null)[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = incAccounts.find((a: any) => titles.some((t) => (a.title ?? "").includes(t)));
    if (!acc) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (acc.values ?? []).map((v: any) => (typeof v === "number" && !isNaN(v) ? v : null));
  }

  const revenues    = getAccount(["매출액"]);
  const opIncomes   = getAccount(["영업이익"]);
  const netIncomes  = getAccount(["당기순이익"]);
  const epsArr      = getAccount(["EPS"]);

  const incomeStatement = incDates
    .map((d, i) => ({
      date: d.replace("/", "-"),
      revenue:   revenues[i]   != null ? revenues[i]! * OEK   : null,
      netIncome: netIncomes[i] != null ? netIncomes[i]! * OEK : null,
      ebitda:    opIncomes[i]  != null ? opIncomes[i]! * OEK  : null,
      eps:       epsArr[i] ?? null,
    }))
    .filter((r) => r.revenue != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  // 수익성 지표 계산 (YoY)
  let operatingMargins: number | null = null;
  let profitMargins: number | null = null;
  let revenueGrowth: number | null = null;
  let earningsGrowth: number | null = null;

  if (incomeStatement.length >= 1) {
    const latest = incomeStatement[0];
    if (latest.revenue && latest.ebitda)    operatingMargins = (latest.ebitda / latest.revenue) * 100;
    if (latest.revenue && latest.netIncome) profitMargins    = (latest.netIncome / latest.revenue) * 100;
  }
  if (incomeStatement.length >= 2) {
    const [curr, prev] = incomeStatement;
    if (curr.revenue && prev.revenue && prev.revenue !== 0)
      revenueGrowth = ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100;
    if (curr.netIncome && prev.netIncome && prev.netIncome !== 0)
      earningsGrowth = ((curr.netIncome - prev.netIncome) / Math.abs(prev.netIncome)) * 100;
  }

  // 네이버 재무상태표
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bsAccounts: any[] = naverBalance?.financeInfo?.accounts ?? naverBalance?.accounts ?? [];
  const bsDates: string[] = naverBalance?.financeInfo?.endDate ?? naverBalance?.endDate ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getBsAccount(titles: string[]): (number | null)[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = bsAccounts.find((a: any) => titles.some((t) => (a.title ?? "").includes(t)));
    if (!acc) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (acc.values ?? []).map((v: any) => (typeof v === "number" && !isNaN(v) ? v : null));
  }

  const totalAssetsArr = getBsAccount(["자산총계"]);
  const totalDebtArr   = getBsAccount(["부채총계"]);
  const cashArr        = getBsAccount(["현금및현금성자산", "현금"]);
  const equityArr      = getBsAccount(["자본총계"]);

  const balanceSheet = bsDates
    .map((d, i) => ({
      date:               d.replace("/", "-"),
      totalAssets:        totalAssetsArr[i] != null ? totalAssetsArr[i]! * OEK : null,
      totalDebt:          totalDebtArr[i]   != null ? totalDebtArr[i]! * OEK   : null,
      cash:               cashArr[i]        != null ? cashArr[i]! * OEK        : null,
      stockholdersEquity: equityArr[i]      != null ? equityArr[i]! * OEK      : null,
    }))
    .filter((r) => r.totalAssets != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  void findNaverAccount; // suppress unused warning

  return {
    ticker,
    symbol: usedSymbol,
    name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
    currency: "KRW",
    price: quoteResult.regularMarketPrice,
    changePct: quoteResult.regularMarketChangePercent ?? 0,
    fiftyTwoWeekLow:  quoteResult.fiftyTwoWeekLow ?? sd.fiftyTwoWeekLow ?? 0,
    fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
    trailingPE:   per,
    forwardPE:    null,
    pegRatio:     null,
    priceToBook:  pbr,
    priceToSales: null,
    evToEbitda:   null,
    grossMargins:     null,
    operatingMargins,
    profitMargins,
    returnOnEquity:   roe,
    returnOnAssets:   null,
    trailingEps: eps,
    forwardEps:  null,
    dividendYield: divRate,
    payoutRatio:  null,
    revenueGrowth,
    earningsGrowth,
    beta: nullNum(quoteResult.beta ?? sd.beta),
    marketCap: nullNum(quoteResult.marketCap),
    sector:   sp.sector ?? null,
    industry: sp.industry ?? null,
    description: sp.longBusinessSummary ?? null,
    chart,
    incomeStatement,
    balanceSheet,
  };
}

// ─── 해외 주식 fetch (기존 Yahoo Finance) ─────────────────────────────────────
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
        period1: oneYearAgo,
        period2: now,
        interval: "1d",
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
      ? [tsResult[0], tsResult[1]]
      : [[], []];
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
      fiftyTwoWeekLow:  quoteResult.fiftyTwoWeekLow ?? sd.fiftyTwoWeekLow ?? 0,
      fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
      trailingPE: nullNum(sd.trailingPE ?? quoteResult.trailingPE),
      forwardPE:  nullNum(sd.forwardPE  ?? quoteResult.forwardPE),
      pegRatio:   nullNum(ks.pegRatio),
      priceToBook: nullNum(ks.priceToBook ?? quoteResult.priceToBook),
      priceToSales: nullNum(ks.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
      evToEbitda: nullNum(ks.enterpriseToEbitda),
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

  let data: StockDetailResponse | null = null;

  if (isKoreanTicker(ticker)) {
    data = await fetchKoreanStockDetail(ticker, ticker);
  } else {
    const symbol = resolveYahooSymbol(ticker);
    data = await fetchStockDetail(symbol, ticker);
  }

  if (!data) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  cache.set(ticker, { data, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(data);
}
