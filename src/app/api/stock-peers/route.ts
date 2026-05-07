import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import YahooFinance from "yahoo-finance2";
import { resolveYahooSymbol, isKoreanTicker } from "@/lib/ticker-resolver";
import { DEFAULT_AI_PARAMS_JSON } from "@/lib/ai-config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface PeerItem {
  ticker: string;
  symbol: string;
  name: string;
  currency: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  isTarget: boolean;
}

export interface StockPeersResponse {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  peers: PeerItem[];
}

// 1시간 캐시
const cache = new Map<string, { data: StockPeersResponse; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function pct(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Math.round(v * 1000) / 10; // xx.x%
}

// 네이버 파이낸스 (한국 피어용)
const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Referer": "https://m.stock.naver.com/",
};

function parseNaverNum(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[,배원%조억만\s]/g, ""));
  return isNaN(n) ? null : n;
}

async function fetchNaverPeerMetrics(code: string): Promise<Map<string, string>> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers: NAVER_HEADERS });
    if (!res.ok) return new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos: { code: string; value: string }[] = data?.totalInfos ?? [];
    return new Map(infos.map((i) => [i.code, i.value]));
  } catch { return new Map(); }
}

async function fetchPeerMetrics(symbol: string, ticker: string, isTarget = false): Promise<PeerItem | null> {
  const isKorean = isKoreanTicker(ticker.replace(/\.(KS|KQ)$/i, ""));

  if (isKorean) {
    // 한국 종목: Yahoo(가격/시총) + 네이버(재무지표)
    const code = ticker.replace(/\.(KS|KQ)$/i, "");
    try {
      const [q, naverMap] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yf.quote(symbol) as Promise<any>,
        fetchNaverPeerMetrics(code),
      ]);
      if (!q?.regularMarketPrice) return null;

      const per = parseNaverNum(naverMap.get("per"));
      const pbr = parseNaverNum(naverMap.get("pbr"));
      const eps = parseNaverNum(naverMap.get("eps"));
      const bps = parseNaverNum(naverMap.get("bps"));
      const roe = eps != null && bps != null && bps !== 0 ? (eps / bps) * 100 : null;

      return {
        ticker: code,
        symbol,
        name: q.shortName ?? q.longName ?? code,
        currency: "KRW",
        price: q.regularMarketPrice ?? null,
        changePct: q.regularMarketChangePercent ?? null,
        marketCap: q.marketCap ?? null,
        trailingPE: per,
        forwardPE: parseNaverNum(naverMap.get("cnsPer")),
        priceToBook: pbr,
        profitMargins: null,
        operatingMargins: null,
        returnOnEquity: roe,
        revenueGrowth: null,
        earningsGrowth: null,
        beta: q.beta ?? null,
        isTarget,
      };
    } catch { return null; }
  }

  // 해외 종목: Yahoo Finance
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [q, s] = await Promise.all([
      yf.quote(symbol) as Promise<any>,
      yf.quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as Promise<any>,
    ]);
    if (!q?.regularMarketPrice) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fd: any = s?.financialData ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ks: any = s?.defaultKeyStatistics ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd: any = s?.summaryDetail ?? {};
    return {
      ticker,
      symbol,
      name: q.shortName ?? q.longName ?? ticker,
      currency: q.currency ?? "USD",
      price: q.regularMarketPrice ?? null,
      changePct: q.regularMarketChangePercent ?? null,
      marketCap: q.marketCap ?? null,
      trailingPE: sd.trailingPE ?? q.trailingPE ?? null,
      forwardPE: sd.forwardPE ?? q.forwardPE ?? null,
      priceToBook: ks.priceToBook ?? null,
      profitMargins: pct(fd.profitMargins),
      operatingMargins: pct(fd.operatingMargins),
      returnOnEquity: pct(fd.returnOnEquity),
      revenueGrowth: fd.revenueGrowth != null ? Math.round(fd.revenueGrowth * 1000) / 10 : null,
      earningsGrowth: fd.earningsGrowth != null ? Math.round(fd.earningsGrowth * 1000) / 10 : null,
      beta: ks.beta ?? sd.beta ?? null,
      isTarget,
    };
  } catch { return null; }
}

async function resolveSymbol(ticker: string): Promise<string> {
  if (isKoreanTicker(ticker)) {
    for (const suffix of [".KS", ".KQ"]) {
      const sym = `${ticker}${suffix}`;
      try {
        const q = await yf.quote(sym) as { regularMarketPrice?: number };
        if (q?.regularMarketPrice) return sym;
      } catch { /* continue */ }
    }
    return `${ticker}.KS`;
  }
  return resolveYahooSymbol(ticker);
}

async function getPeerTickers(
  ticker: string, name: string, sector: string | null, industry: string | null
): Promise<{ ticker: string; name: string }[]> {
  const prompt = `You are a financial analyst. Given the company below, list exactly 6 peer/competitor companies.
Return ONLY a JSON object: { "peers": [ { "ticker": "...", "name": "..." } ] }

Company: ${name} (${ticker})
Sector: ${sector ?? "unknown"}
Industry: ${industry ?? "unknown"}

Rules:
- Use Yahoo Finance ticker symbols (e.g. AAPL, 005930.KS, 000660.KS)
- For Korean stocks, append .KS or .KQ
- Choose direct competitors of similar size
- Do NOT include the input company itself`;

  try {
    const res = await openai.chat.completions.create({
      ...DEFAULT_AI_PARAMS_JSON,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { peers?: { ticker: string; name: string }[] };
    return parsed.peers?.slice(0, 8) ?? [];
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const now = Date.now();
  const cached = cache.get(ticker);
  if (cached && cached.expiresAt > now) return NextResponse.json(cached.data);

  // 1. 대상 종목 정보 조회
  const targetSymbol = await resolveSymbol(ticker);
  const targetMetrics = await fetchPeerMetrics(targetSymbol, ticker, true);
  if (!targetMetrics) {
    return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${ticker}` }, { status: 404 });
  }

  // sector/industry는 summaryProfile에서 별도 조회
  let sector: string | null = null;
  let industry: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = await yf.quoteSummary(targetSymbol, { modules: ["summaryProfile"] }) as any;
    sector = sp?.summaryProfile?.sector ?? null;
    industry = sp?.summaryProfile?.industry ?? null;
  } catch { /* ignore */ }

  // 2. GPT로 피어 목록 생성
  const peerList = await getPeerTickers(ticker, targetMetrics.name, sector, industry);

  // 3. 피어 지표 병렬 조회
  const peerResults = await Promise.allSettled(
    peerList.map(async (p) => {
      // ticker에 .KS/.KQ 이미 포함된 경우 그대로 사용
      const sym = p.ticker.includes(".") ? p.ticker : await resolveSymbol(p.ticker);
      const rawTicker = p.ticker.replace(/\.(KS|KQ)$/i, "");
      return fetchPeerMetrics(sym, rawTicker);
    })
  );

  const peers: PeerItem[] = [
    targetMetrics,
    ...peerResults
      .filter((r): r is PromiseFulfilledResult<PeerItem | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v): v is PeerItem => v !== null),
  ];

  const data: StockPeersResponse = {
    ticker, name: targetMetrics.name, sector, industry, peers,
  };

  cache.set(ticker, { data, expiresAt: now + CACHE_TTL });
  return NextResponse.json(data);
}
