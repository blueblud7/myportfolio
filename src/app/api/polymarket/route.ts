import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/events?limit=100&active=true&closed=false&order=volume&ascending=false",
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error("Polymarket API error");

    const raw: {
      id: string;
      title: string;
      endDate: string;
      markets?: {
        question: string;
        outcomes: string;
        outcomePrices: string;
        volume: string;
      }[];
    }[] = await res.json();

    const arr = Array.isArray(raw) ? raw : [];

    // 금융/투자 관련 이벤트 필터링
    const filtered = arr.filter((e) => {
      const t = (e.title || "").toLowerCase();
      return FINANCE_KEYWORDS.some((k) => t.includes(k));
    });

    const events: PolymarketEvent[] = filtered.slice(0, 12).map((e) => ({
      id: e.id,
      title: e.title,
      endDate: e.endDate?.slice(0, 10) ?? "",
      volume: (e.markets ?? []).reduce((sum, m) => sum + parseFloat(m.volume || "0"), 0),
      markets: (e.markets ?? []).slice(0, 3).map((m) => {
        const outcomes: string[] = JSON.parse(m.outcomes || "[]");
        const prices: number[] = JSON.parse(m.outcomePrices || "[]").map((p: string) => parseFloat(p));
        return {
          question: m.question,
          outcomes,
          prices,
          volume: parseFloat(m.volume || "0"),
        };
      }),
    }));

    // volume 순 정렬
    events.sort((a, b) => b.volume - a.volume);

    return NextResponse.json(events, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
