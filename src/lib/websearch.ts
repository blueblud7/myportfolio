/**
 * Tavily 웹검색 (LLM 에이전트용). TAVILY_API_KEY 없으면 비활성(빈 결과).
 * https://docs.tavily.com
 */
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const TAVILY_URL = "https://api.tavily.com/search";

export function isWebSearchConfigured(): boolean {
  return !!TAVILY_KEY;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;   // 발췌
}

export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  if (!TAVILY_KEY) return [];
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        max_results: maxResults,
        search_depth: "basic",
        topic: "news",
      }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = json?.results ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: (r.content ?? "").slice(0, 500),
    })).filter((r: WebSearchResult) => r.title && r.url);
  } catch {
    return [];
  }
}
