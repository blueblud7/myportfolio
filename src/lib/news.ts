import YahooFinance from "yahoo-finance2";
import { isKoreanTicker, resolveYahooSymbol } from "./ticker-resolver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = "https://finnhub.io/api/v1";

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  datetime: string;  // ISO
  summary?: string;
}

/** 종목별 애널리스트 스냅샷 — 전일 대비 "주안점 변화" diff에 사용. */
export interface AnalystSnapshot {
  rating: string | null;          // recommendationKey (예: "buy")
  targetMean: number | null;      // 평균 목표가
  numberOfAnalysts: number | null;
  recentRatingChanges: { firm: string; action: string; from?: string; to?: string; date: string }[];
}

function toIso(unixSec: number | undefined): string {
  if (!unixSec) return "";
  return new Date(unixSec * 1000).toISOString();
}

// ── Finnhub 기업 뉴스 (미국 종목) ──────────────────────────────────────────────
async function getFinnhubNews(symbol: string, fromDate: string, toDate: string): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) return [];
  try {
    const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return json.slice(0, 8).map((n: any) => ({
      title: n.headline ?? "",
      source: n.source ?? "Finnhub",
      url: n.url ?? "",
      datetime: toIso(n.datetime),
      summary: n.summary || undefined,
    })).filter((n: NewsItem) => n.title && n.url);
  } catch {
    return [];
  }
}

// ── Yahoo 검색 뉴스 (미국+한국) ────────────────────────────────────────────────
async function getYahooNews(query: string, sinceMs: number): Promise<NewsItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.search(query, { newsCount: 8, quotesCount: 0 }, { validateResult: false });
    const news = Array.isArray(result?.news) ? result.news : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return news.map((n: any) => ({
      title: n.title ?? "",
      source: n.publisher ?? "Yahoo",
      url: n.link ?? "",
      datetime: toIso(n.providerPublishTime),
      summary: undefined,
    }))
      .filter((n: NewsItem) => n.title && n.url)
      .filter((n: NewsItem) => !n.datetime || new Date(n.datetime).getTime() >= sinceMs);
  } catch {
    return [];
  }
}

/**
 * 한 종목의 최근 뉴스 헤드라인.
 * 미국: Finnhub 기업뉴스 + Yahoo, 한국: Yahoo(회사명 검색).
 * 중복 제목 제거 후 최신순 정렬.
 */
export async function getStockNews(ticker: string, name: string, sinceDays: number): Promise<NewsItem[]> {
  if (ticker === "CASH") return [];
  const now = Date.now();
  const sinceMs = now - sinceDays * 24 * 60 * 60 * 1000;
  const fromDate = new Date(sinceMs).toISOString().slice(0, 10);
  const toDate = new Date(now).toISOString().slice(0, 10);
  const korean = isKoreanTicker(ticker);

  const [finnhub, yahoo] = await Promise.all([
    korean ? Promise.resolve([]) : getFinnhubNews(ticker, fromDate, toDate),
    // 한국 종목은 회사명으로, 미국 종목은 심볼로 검색
    getYahooNews(korean ? name : ticker, sinceMs),
  ]);

  const seen = new Set<string>();
  return [...finnhub, ...yahoo]
    .filter((n) => {
      const key = n.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""))
    .slice(0, 10);
}

/** 한 종목의 애널리스트 스냅샷(목표가·등급·최근 등급변경). Yahoo quoteSummary. */
export async function getAnalystSnapshot(ticker: string): Promise<AnalystSnapshot | null> {
  if (ticker === "CASH") return null;
  try {
    const symbol = resolveYahooSymbol(ticker);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qs: any = await yf.quoteSummary(symbol, {
      modules: ["financialData", "upgradeDowngradeHistory"],
    });
    const fd = qs?.financialData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history: any[] = qs?.upgradeDowngradeHistory?.history ?? [];
    const recent = history
      .filter((h) => h?.epochGradeDate)
      .sort((a, b) => new Date(b.epochGradeDate).getTime() - new Date(a.epochGradeDate).getTime())
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((h: any) => ({
        firm: h.firm ?? "",
        action: h.action ?? "",
        from: h.fromGrade || undefined,
        to: h.toGrade || undefined,
        date: new Date(h.epochGradeDate).toISOString().slice(0, 10),
      }));

    return {
      rating: fd?.recommendationKey ?? null,
      targetMean: typeof fd?.targetMeanPrice === "number" ? fd.targetMeanPrice : null,
      numberOfAnalysts: typeof fd?.numberOfAnalystOpinions === "number" ? fd.numberOfAnalystOpinions : null,
      recentRatingChanges: recent,
    };
  } catch {
    return null;
  }
}
