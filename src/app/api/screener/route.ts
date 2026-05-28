// GET /api/screener?mktId=STK|KSQ|both&perMin=&perMax=&pbrMin=&pbrMax=...
// KRX 전체 종목 (시세 + 밸류에이션) 병합 후 필터/정렬
import { NextRequest, NextResponse } from "next/server";
import { getKrxAllPrices, getKrxValuations } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 45;

export interface ScreenerStock {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
  price: number;
  changePct: number;
  marketCap: number; // 억원
  volume: number;
  tradingValue: number; // 억원
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  divYield: number | null;
  divPerShare: number | null;
}

async function buildScreenerData(mktId: "STK" | "KSQ"): Promise<ScreenerStock[]> {
  const cacheKey = `screener:krx:${mktId}`;
  const cached = await getStockCache<ScreenerStock[]>(cacheKey);
  if (cached) return cached;

  const [prices, valuations] = await Promise.all([
    getKrxAllPrices(mktId),
    getKrxValuations(mktId),
  ]);

  if (prices.length === 0) return [];

  const valMap = new Map(valuations.map(v => [v.code, v]));

  const stocks: ScreenerStock[] = prices
    .filter(p => p.close > 0)
    .map(p => {
      const v = valMap.get(p.code);
      return {
        code: p.code,
        name: p.name,
        market: p.market,
        sector: p.sector,
        price: p.close,
        changePct: p.changePct,
        marketCap: p.marketCap,
        volume: p.volume,
        tradingValue: p.tradingValue,
        per: v?.per ?? null,
        pbr: v?.pbr ?? null,
        eps: v?.eps ?? null,
        bps: v?.bps ?? null,
        divYield: v?.divYield ?? null,
        divPerShare: v?.divPerShare ?? null,
      };
    });

  await setStockCache(cacheKey, stocks, 30 * 60 * 1000);
  return stocks;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mktId = (sp.get("mktId") ?? "both") as "STK" | "KSQ" | "both";

  let stocks: ScreenerStock[] = [];
  if (mktId === "both") {
    const [kospi, kosdaq] = await Promise.all([
      buildScreenerData("STK"),
      buildScreenerData("KSQ"),
    ]);
    stocks = [...kospi, ...kosdaq];
  } else {
    stocks = await buildScreenerData(mktId);
  }

  if (stocks.length === 0) {
    return NextResponse.json(
      { error: "KRX 데이터를 불러올 수 없습니다. KRX_API_KEY 환경변수와 API 서비스 신청 상태를 확인하세요.", stocks: [], total: 0, sectors: [] },
      { status: 503 }
    );
  }

  // ─── 필터 ────────────────────────────────────────────────────────────────────
  const get = (key: string) => { const v = sp.get(key); return v !== null && v !== "" ? Number(v) : null; };

  const perMin = get("perMin");
  const perMax = get("perMax");
  const pbrMin = get("pbrMin");
  const pbrMax = get("pbrMax");
  const capMin = get("capMin");   // 억원
  const capMax = get("capMax");
  const divYieldMin = get("divYieldMin");
  const changePctMin = get("changePctMin");
  const changePctMax = get("changePctMax");
  const epsMin = get("epsMin");
  const sector = sp.get("sector");
  const onlyPositivePer = sp.get("onlyPositivePer") !== "false";  // default true (negative PER = 적자)
  const onlyPositivePbr = sp.get("onlyPositivePbr") === "true";

  let filtered = stocks;

  if (perMin !== null || perMax !== null || onlyPositivePer) {
    filtered = filtered.filter(s => {
      if (s.per === null) return false;
      if (onlyPositivePer && s.per <= 0) return false;
      if (perMin !== null && s.per < perMin) return false;
      if (perMax !== null && s.per > perMax) return false;
      return true;
    });
  }
  if (pbrMin !== null || pbrMax !== null || onlyPositivePbr) {
    filtered = filtered.filter(s => {
      if (s.pbr === null) return false;
      if (onlyPositivePbr && s.pbr <= 0) return false;
      if (pbrMin !== null && s.pbr < pbrMin) return false;
      if (pbrMax !== null && s.pbr > pbrMax) return false;
      return true;
    });
  }
  if (capMin !== null) filtered = filtered.filter(s => s.marketCap >= capMin);
  if (capMax !== null) filtered = filtered.filter(s => s.marketCap <= capMax);
  if (divYieldMin !== null) filtered = filtered.filter(s => s.divYield !== null && s.divYield >= divYieldMin);
  if (changePctMin !== null) filtered = filtered.filter(s => s.changePct >= changePctMin);
  if (changePctMax !== null) filtered = filtered.filter(s => s.changePct <= changePctMax);
  if (epsMin !== null) filtered = filtered.filter(s => s.eps !== null && s.eps >= epsMin);
  if (sector && sector !== "all") filtered = filtered.filter(s => s.sector === sector);

  // ─── 정렬 ────────────────────────────────────────────────────────────────────
  type SortKey = "per" | "pbr" | "divYield" | "changePct" | "marketCap" | "eps" | "tradingValue";
  const sortBy = (sp.get("sortBy") ?? "marketCap") as SortKey;
  const sortDir = sp.get("sortDir") === "asc" ? 1 : -1;

  filtered.sort((a, b) => {
    const av = a[sortBy] as number | null;
    const bv = b[sortBy] as number | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;   // null은 뒤로
    if (bv === null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
  });

  const limit = Math.min(Number(sp.get("limit") ?? "200"), 500);
  const page = Number(sp.get("page") ?? "0");
  const total = filtered.length;
  const result = filtered.slice(page * limit, (page + 1) * limit);

  const sectors = [...new Set(stocks.map(s => s.sector).filter(Boolean))].sort();

  return NextResponse.json({ stocks: result, total, sectors, page, limit });
}
