const KEY = process.env.FINNHUB_API_KEY;
const BASE = "https://finnhub.io/api/v1";

export interface FinnhubEarningsSurprise {
  actual: number | null;
  estimate: number | null;
  period: string;        // "2024-09-30"
  quarter: number;       // 1-4
  year: number;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
}

export async function getFinnhubEarnings(ticker: string): Promise<FinnhubEarningsSurprise[] | null> {
  if (!KEY) return null;
  if (ticker === "CASH") return null;
  try {
    const res = await fetch(`${BASE}/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${KEY}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return null;
    return json as FinnhubEarningsSurprise[];
  } catch {
    return null;
  }
}

export interface FinnhubRecommendation {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;       // "2025-04-01"
  symbol: string;
}

export async function getFinnhubRecommendations(ticker: string): Promise<FinnhubRecommendation[] | null> {
  if (!KEY) return null;
  if (ticker === "CASH") return null;
  try {
    const res = await fetch(`${BASE}/stock/recommendation?symbol=${encodeURIComponent(ticker)}&token=${KEY}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json)) return null;
    return json as FinnhubRecommendation[];
  } catch {
    return null;
  }
}
