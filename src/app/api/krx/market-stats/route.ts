// GET /api/krx/market-stats → KOSPI/KOSDAQ 종합 시장 통계
// 시가총액, PER, PBR, 배당수익률, 거래대금 등 공식 KRX 데이터

import { NextResponse } from "next/server";
import { getKrxAllPrices, getKrxValuations, getKrxIndices } from "@/lib/krx";
import { getStockCache, setStockCache } from "@/lib/stock-cache";

export const maxDuration = 45;

function wgtAvg(vals: (number | null)[], weights: number[]): number | null {
  let sumW = 0, sumV = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] != null) { sumV += vals[i]! * weights[i]; sumW += weights[i]; }
  }
  return sumW > 0 ? sumV / sumW : null;
}

async function buildMarketStats(mktId: "STK" | "KSQ") {
  const [prices, valuations, indices] = await Promise.all([
    getKrxAllPrices(mktId),
    getKrxValuations(mktId),
    getKrxIndices(mktId === "STK" ? "1" : "2"),
  ]);

  const valMap = new Map(valuations.map(v => [v.code, v]));

  // 시가총액 가중 PER/PBR/배당수익률
  const pers: number[] = [], pbrs: number[] = [], divYlds: number[] = [], mktCaps: number[] = [];
  for (const p of prices) {
    const v = valMap.get(p.code);
    if (!v) continue;
    mktCaps.push(p.marketCap);
    pers.push(v.per ?? -1);
    pbrs.push(v.pbr ?? -1);
    divYlds.push(v.divYield ?? 0);
  }

  const validPers = pers.map((p, i) => p > 0 ? p : null);
  const validPbrs = pbrs.map((p, i) => p > 0 ? p : null);

  // 총 시가총액, 총 거래대금
  const totalMarketCap = prices.reduce((s, p) => s + p.marketCap, 0); // 억원
  const totalTradingValue = prices.reduce((s, p) => s + p.tradingValue, 0); // 억원

  // 등락 종목 수
  const advancing = prices.filter(p => p.change > 0).length;
  const declining = prices.filter(p => p.change < 0).length;
  const unchanged = prices.filter(p => p.change === 0).length;

  // 대표 지수 (첫 번째 = KOSPI or KOSDAQ 종합)
  const mainIdx = indices.find(i => i.indexName.includes("종합") || i.indexName.includes("KOSPI") || i.indexName.includes("코스닥"));

  // 업종별 수익률
  const sectorMap = new Map<string, { totalCap: number; totalChange: number; count: number }>();
  for (const p of prices) {
    if (!p.sector) continue;
    const s = sectorMap.get(p.sector) ?? { totalCap: 0, totalChange: 0, count: 0 };
    s.totalCap += p.marketCap;
    s.totalChange += p.changePct * p.marketCap;
    s.count += 1;
    sectorMap.set(p.sector, s);
  }
  const sectors = Array.from(sectorMap.entries())
    .map(([name, s]) => ({
      name,
      changePct: s.totalCap > 0 ? s.totalChange / s.totalCap : 0,
      marketCap: s.totalCap,
      count: s.count,
    }))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 20);

  return {
    market: mktId === "STK" ? "KOSPI" : "KOSDAQ",
    totalMarketCap,
    totalTradingValue,
    advancing,
    declining,
    unchanged,
    stockCount: prices.length,
    weightedPer: wgtAvg(validPers, mktCaps),
    weightedPbr: wgtAvg(validPbrs, mktCaps),
    avgDivYield: divYlds.length ? divYlds.reduce((s, v) => s + v, 0) / divYlds.length : null,
    mainIndex: mainIdx ?? null,
    sectors,
    topGainers: prices.filter(p => p.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 10),
    topLosers: prices.filter(p => p.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 10),
    mostTraded: [...prices].sort((a, b) => b.tradingValue - a.tradingValue).slice(0, 10),
  };
}

export async function GET() {
  const cacheKey = "krx:market-stats";
  const cached = await getStockCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  const [kospi, kosdaq] = await Promise.all([
    buildMarketStats("STK"),
    buildMarketStats("KSQ"),
  ]);

  const result = { kospi, kosdaq, updatedAt: new Date().toISOString() };
  await setStockCache(cacheKey, result, 30 * 60 * 1000); // 30분
  return NextResponse.json(result);
}
