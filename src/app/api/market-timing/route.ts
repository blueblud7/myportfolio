// GET /api/market-timing
// ?indicator=vix|fng&direction=below|above&threshold=N&hold=N&index=sp500|kospi|nasdaq&years=5&cooldown=30
import { NextRequest, NextResponse } from "next/server";
import {
  fetchYahooDaily, fetchCnnFearGreedHistorical,
  runBacktest, INDEX_SYMBOLS, KNOWN_EVENTS,
  type Indicator, type Direction, type IndexSymbol, type IndicatorPoint,
} from "@/lib/market-timing";

export const maxDuration = 30;

interface CachedSeries {
  ts: number;
  fng: IndicatorPoint[];
  vix: { date: string; close: number }[];
  indices: Record<IndexSymbol, { date: string; close: number }[]>;
}

let cache: CachedSeries | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1시간

async function getSeries(): Promise<CachedSeries> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache;

  const [fng, vix, sp500, kospi, nasdaq] = await Promise.all([
    fetchCnnFearGreedHistorical(),
    fetchYahooDaily("^VIX", 5).catch(() => []),
    fetchYahooDaily(INDEX_SYMBOLS.sp500.symbol, 5).catch(() => []),
    fetchYahooDaily(INDEX_SYMBOLS.kospi.symbol, 5).catch(() => []),
    fetchYahooDaily(INDEX_SYMBOLS.nasdaq.symbol, 5).catch(() => []),
  ]);

  cache = {
    ts: Date.now(),
    fng,
    vix,
    indices: { sp500, kospi, nasdaq },
  };
  return cache;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const indicator = (sp.get("indicator") ?? "vix") as Indicator;
  const direction = (sp.get("direction") ?? (indicator === "vix" ? "above" : "below")) as Direction;
  const threshold = Number(sp.get("threshold") ?? (indicator === "vix" ? "30" : "25"));
  const hold = Number(sp.get("hold") ?? "30");
  const indexKey = (sp.get("index") ?? "sp500") as IndexSymbol;
  const cooldown = Number(sp.get("cooldown") ?? "30");
  const chartMode = sp.get("chart") === "1";

  const series = await getSeries();
  const indexData = series.indices[indexKey] ?? [];
  const indicatorSeries: IndicatorPoint[] = indicator === "vix"
    ? series.vix.map(p => ({ date: p.date, value: p.close }))
    : series.fng;

  if (chartMode) {
    // 차트용: indicator + index + events
    const indexMap = new Map(indexData.map(p => [p.date, p.close]));
    const indSorted = [...indicatorSeries].sort((a, b) => a.date.localeCompare(b.date));
    const merged = indSorted.map(p => ({
      date: p.date,
      indicator: p.value,
      index: indexMap.get(p.date) ?? null,
    }));
    return NextResponse.json({
      indicator,
      indexKey,
      indexLabel: INDEX_SYMBOLS[indexKey].label,
      points: merged,
      events: KNOWN_EVENTS,
    });
  }

  const result = runBacktest({
    indicator: indicatorSeries,
    index: indexData,
    direction,
    threshold,
    holdDays: hold,
    cooldownDays: cooldown,
  });

  return NextResponse.json({
    params: { indicator, direction, threshold, hold, indexKey, cooldown },
    indexLabel: INDEX_SYMBOLS[indexKey].label,
    entries: result.entries,
    stats: result.stats,
    indicatorRange: indicatorSeries.length
      ? { from: indicatorSeries[0].date, to: indicatorSeries[indicatorSeries.length - 1].date }
      : null,
  });
}
