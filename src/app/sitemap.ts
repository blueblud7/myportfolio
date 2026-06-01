import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = "https://myportfolio.blueming.net";

/**
 * 검색엔진에 노출할 공개 경로.
 * 로그인·개인 데이터 페이지(dashboard·accounts·alerts·budget·diary·goals·
 * insights·reports·watchlist 등)와 /login 은 의도적으로 제외한다.
 * 홈은 / 가 /dashboard 로 리다이렉트되므로 마케팅 페이지인 /landing 을 기준으로 삼는다.
 */
const PUBLIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" }, // 루트 (/ → /landing 리다이렉트)
  { path: "/landing", priority: 0.9, changeFrequency: "weekly" },
  // 시장·데이터 페이지 (매일 갱신)
  { path: "/stocks", priority: 0.8, changeFrequency: "daily" },
  { path: "/krx-market", priority: 0.8, changeFrequency: "daily" },
  { path: "/etf-flow", priority: 0.8, changeFrequency: "daily" },
  { path: "/earnings", priority: 0.7, changeFrequency: "daily" },
  { path: "/analyst-reports", priority: 0.7, changeFrequency: "daily" },
  { path: "/fomo-agents", priority: 0.7, changeFrequency: "daily" },
  { path: "/ten-bagger", priority: 0.7, changeFrequency: "daily" },
  // 분석·도구 페이지 (주간 갱신)
  { path: "/quant", priority: 0.6, changeFrequency: "weekly" },
  { path: "/canslim", priority: 0.6, changeFrequency: "weekly" },
  { path: "/pattern-lab", priority: 0.6, changeFrequency: "weekly" },
  { path: "/pattern", priority: 0.6, changeFrequency: "weekly" },
  { path: "/strategy-lab", priority: 0.6, changeFrequency: "weekly" },
  { path: "/backtest", priority: 0.6, changeFrequency: "weekly" },
  { path: "/portfolio-mix", priority: 0.6, changeFrequency: "weekly" },
  { path: "/position-lab", priority: 0.6, changeFrequency: "weekly" },
  { path: "/volatility", priority: 0.6, changeFrequency: "weekly" },
  { path: "/compare", priority: 0.6, changeFrequency: "weekly" },
  { path: "/calculator", priority: 0.5, changeFrequency: "monthly" },
];

/** localePrefix: "as-needed" — 기본 로케일(ko)은 접두사 없음, 그 외(en)는 /en 접두사. */
function localizedUrl(locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${BASE_URL}${prefix}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => {
    // hreflang 대체 링크 (ko/en)
    const languages: Record<string, string> = {};
    for (const locale of routing.locales) {
      languages[locale] = localizedUrl(locale, path);
    }

    return {
      url: localizedUrl(routing.defaultLocale, path),
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages },
    };
  });
}
