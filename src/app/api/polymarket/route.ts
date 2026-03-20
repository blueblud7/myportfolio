import { NextRequest, NextResponse } from "next/server";

export interface PolymarketEvent {
  id: string;
  title: string;
  endDate: string;
  volume: number;
  markets: {
    question: string;
    outcomes: string[];
    prices: number[];
    volume: number;
  }[];
}

const FINANCE_KEYWORDS = [
  "fed", "rate", "bitcoin", "btc", "crypto", "inflation", "gdp",
  "recession", "s&p", "nasdaq", "gold", "tariff", "interest",
  "stock", "economy", "market", "bond", "yield", "dollar",
];

type RawEvent = {
  id: string;
  title: string;
  endDate: string;
  markets?: {
    question: string;
    outcomes: string;
    outcomePrices: string;
    volume: string;
  }[];
};

function parseEvents(raw: RawEvent[], limit: number): PolymarketEvent[] {
  const events: PolymarketEvent[] = raw.slice(0, limit).map((e) => ({
    id: e.id,
    title: e.title,
    endDate: e.endDate?.slice(0, 10) ?? "",
    volume: (e.markets ?? []).reduce((sum, m) => sum + parseFloat(m.volume || "0"), 0),
    markets: (e.markets ?? []).slice(0, 3).map((m) => {
      const outcomes: string[] = JSON.parse(m.outcomes || "[]");
      const prices: number[] = JSON.parse(m.outcomePrices || "[]").map((p: string) => parseFloat(p));
      return { question: m.question, outcomes, prices, volume: parseFloat(m.volume || "0") };
    }),
  }));
  events.sort((a, b) => b.volume - a.volume);
  return events;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  try {
    let url: string;

    if (q) {
      // 검색 모드: Polymarket q= 파라미터 사용
      url = `https://gamma-api.polymarket.com/events?q=${encodeURIComponent(q)}&limit=20&active=true&closed=false&order=volume&ascending=false`;
    } else {
      // 기본 모드: 금융 키워드 필터
      url = "https://gamma-api.polymarket.com/events?limit=40&active=true&closed=false&order=volume&ascending=false";
    }

    const res = await fetch(url, { next: { revalidate: q ? 60 : 300 } });
    if (!res.ok) throw new Error("Polymarket API error");

    const raw: RawEvent[] = await res.json();
    const arr = Array.isArray(raw) ? raw : [];

    let filtered: RawEvent[];
    if (q) {
      // 검색 모드: API가 이미 필터링해줬으므로 그대로 사용
      filtered = arr;
    } else {
      // 기본 모드: 금융 키워드 필터링
      filtered = arr.filter((e) => {
        const t = (e.title || "").toLowerCase();
        return FINANCE_KEYWORDS.some((k) => t.includes(k));
      });
    }

    const events = parseEvents(filtered, q ? 20 : 12);

    return NextResponse.json(events, {
      headers: { "Cache-Control": q ? "s-maxage=60" : "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
