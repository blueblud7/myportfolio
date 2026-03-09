import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface EtfFlowItem {
  ticker: string;
  name: string;
  category: string;
  price: number;
  changePct: number;
  weekChangePct: number | null;
  monthChangePct: number | null;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  holdings: { ticker: string; name: string; pct: number }[];
  sparkline: number[];
}

export interface SmartMoneyStock {
  ticker: string;
  name: string;
  demandScore: number;   // Σ(holdingPct × volumeRatio) — 높을수록 자금 집중
  etfCount: number;      // 보유 ETF 수
  avgHoldingPct: number; // 평균 보유 비중
  totalHoldingPct: number;
  inflows: { etfName: string; pct: number; volumeRatio: number }[];
}

// GET /api/etf-flow — 오늘 캐시된 ETF 데이터 반환
export async function GET(req: NextRequest) {
  const today = new URL(req.url).searchParams.get("date")
    ?? new Date().toISOString().split("T")[0];

  try {
    const sql = getDb();

    const rows = await sql`
      SELECT ticker, name, category, price, change_pct, week_change_pct, month_change_pct,
             volume, avg_volume, volume_ratio, holdings, sparkline
      FROM etf_cache
      WHERE analyzed_date = ${today}
      ORDER BY volume_ratio DESC, ABS(change_pct) DESC
    `.catch(() => []) as {
      ticker: string; name: string; category: string;
      price: number; change_pct: number;
      week_change_pct: number | null; month_change_pct: number | null;
      volume: number; avg_volume: number; volume_ratio: number;
      holdings: unknown; sparkline: unknown;
    }[];

    const parse = (v: unknown) =>
      v == null ? [] : typeof v === "string" ? JSON.parse(v) : v;

    const etfs: EtfFlowItem[] = rows.map(r => ({
      ticker: r.ticker,
      name: r.name,
      category: r.category,
      price: Number(r.price),
      changePct: Number(r.change_pct),
      weekChangePct: r.week_change_pct != null ? Number(r.week_change_pct) : null,
      monthChangePct: r.month_change_pct != null ? Number(r.month_change_pct) : null,
      volume: Number(r.volume),
      avgVolume: Number(r.avg_volume),
      volumeRatio: Number(r.volume_ratio),
      holdings: parse(r.holdings) as EtfFlowItem["holdings"],
      sparkline: parse(r.sparkline) as number[],
    }));

    // ── 스마트머니 계산 ──────────────────────────────────
    // 자금 유입 ETF (volumeRatio > 1.2) 기반 종목 수요 점수
    const inflowEtfs = etfs.filter(e => e.volumeRatio >= 1.2 && e.holdings.length > 0);
    const stockMap = new Map<string, SmartMoneyStock>();

    for (const etf of inflowEtfs) {
      for (const h of etf.holdings) {
        if (!h.ticker) continue;
        const existing = stockMap.get(h.ticker);
        const contribution = h.pct * etf.volumeRatio;
        if (existing) {
          existing.demandScore += contribution;
          existing.etfCount += 1;
          existing.totalHoldingPct += h.pct;
          existing.avgHoldingPct = existing.totalHoldingPct / existing.etfCount;
          existing.inflows.push({ etfName: etf.name, pct: h.pct, volumeRatio: etf.volumeRatio });
        } else {
          stockMap.set(h.ticker, {
            ticker: h.ticker,
            name: h.name,
            demandScore: contribution,
            etfCount: 1,
            avgHoldingPct: h.pct,
            totalHoldingPct: h.pct,
            inflows: [{ etfName: etf.name, pct: h.pct, volumeRatio: etf.volumeRatio }],
          });
        }
      }
    }

    const smartMoney = Array.from(stockMap.values())
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 50)
      .map(s => ({ ...s, demandScore: Math.round(s.demandScore * 100) / 100 }));

    return NextResponse.json({ etfs, smartMoney, date: today, total: etfs.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
