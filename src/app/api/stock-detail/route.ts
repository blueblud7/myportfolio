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
  // 가격 범위
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  // 밸류에이션
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  // 수익성
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  // EPS & 배당
  trailingEps: number | null;
  forwardEps: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  // 성장
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // 기타
  beta: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  // 차트 (1Y 일봉)
  chart: { date: string; close: number; volume: number }[];
  // 재무제표
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

// 인메모리 캐시 (15분 TTL)
interface CacheEntry {
  data: StockDetailResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function pct(val: number | null | undefined): number | null {
  if (val == null) return null;
  return val * 100;
}

function nullNum(val: number | null | undefined): number | null {
  return val ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // 차트 데이터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = chartResult?.quotes ?? [];
    const chart = quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        date: new Date(q.date).toISOString().slice(0, 10),
        close: q.close as number,
        volume: (q.volume as number) ?? 0,
      }));

    // fundamentalsTimeSeries → 연도별 재무 데이터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tsArr: [any[], any[]] = Array.isArray(tsResult) && tsResult.length >= 2 ? [tsResult[0], tsResult[1]] : [[], []];
    const [finRows, bsRows] = tsArr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRows = (r: any) => (Array.isArray(r) ? r : Object.values(r ?? {})) as any[];

    const incomeStatement = toRows(finRows)
      .filter((r) => r.totalRevenue)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((r) => ({
        date: new Date(r.date).toISOString().slice(0, 7),
        revenue:   (r.totalRevenue   as number | null) ?? null,
        netIncome: (r.netIncomeContinuousOperations ?? r.netIncome as number | null) ?? null,
        ebitda:    (r.ebitda          as number | null) ?? null,
        eps:       (r.dilutedEPS ?? r.eps as number | null) ?? null,
      }));

    const balanceSheet = toRows(bsRows)
      .filter((r) => r.totalAssets)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((r) => ({
        date:              new Date(r.date).toISOString().slice(0, 7),
        totalAssets:       (r.totalAssets           as number | null) ?? null,
        totalDebt:         (r.longTermDebt           as number | null) ?? null,
        cash:              (r.cashAndCashEquivalents as number | null) ?? null,
        stockholdersEquity:(r.stockholdersEquity     as number | null) ?? null,
      }));

    return {
      ticker,
      symbol,
      name: quoteResult.shortName ?? quoteResult.longName ?? ticker,
      currency: quoteResult.currency ?? "USD",
      price: quoteResult.regularMarketPrice,
      changePct: quoteResult.regularMarketChangePercent ?? 0,
      fiftyTwoWeekLow: quoteResult.fiftyTwoWeekLow ?? sd.fiftyTwoWeekLow ?? 0,
      fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh ?? sd.fiftyTwoWeekHigh ?? 0,
      trailingPE: nullNum(sd.trailingPE ?? quoteResult.trailingPE),
      forwardPE: nullNum(sd.forwardPE ?? quoteResult.forwardPE),
      pegRatio: nullNum(ks.pegRatio),
      priceToBook: nullNum(ks.priceToBook),
      priceToSales: nullNum(ks.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months),
      evToEbitda: nullNum(ks.enterpriseToEbitda),
      grossMargins: pct(fd.grossMargins),
      operatingMargins: pct(fd.operatingMargins),
      profitMargins: pct(fd.profitMargins),
      returnOnEquity: pct(fd.returnOnEquity),
      returnOnAssets: pct(fd.returnOnAssets),
      trailingEps: nullNum(ks.trailingEps),
      forwardEps: nullNum(ks.forwardEps ?? fd.forwardEps),
      dividendYield: pct(sd.dividendYield ?? sd.trailingAnnualDividendYield),
      payoutRatio: pct(sd.payoutRatio),
      revenueGrowth: fd.revenueGrowth != null ? fd.revenueGrowth * 100 : null,
      earningsGrowth: fd.earningsGrowth != null ? fd.earningsGrowth * 100 : null,
      beta: nullNum(ks.beta ?? sd.beta),
      marketCap: nullNum(quoteResult.marketCap),
      sector: sp.sector ?? null,
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickerParam = searchParams.get("ticker");

  if (!tickerParam) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const ticker = tickerParam.trim().toUpperCase();

  // 캐시 확인
  const now = Date.now();
  const cached = cache.get(ticker);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data);
  }

  // 한국 종목: .KS → .KQ 순으로 시도
  if (isKoreanTicker(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const symbol = `${ticker}${suffix}`;
      const data = await fetchStockDetail(symbol, ticker);
      if (data) {
        cache.set(ticker, { data, expiresAt: now + CACHE_TTL_MS });
        return NextResponse.json(data);
      }
    }
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  // 해외 종목
  const symbol = resolveYahooSymbol(ticker);
  const data = await fetchStockDetail(symbol, ticker);
  if (!data) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  cache.set(ticker, { data, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(data);
}
