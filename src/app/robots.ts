import type { MetadataRoute } from "next";

const BASE_URL = "https://myportfolio.blueming.net";

/**
 * 검색엔진 크롤러 규칙. 공개 페이지는 허용하되, API·인증·개인 데이터 페이지는 차단한다.
 * sitemap 위치를 명시해 Google 등이 색인 대상을 찾도록 한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/login",
        "/dashboard",
        "/accounts",
        "/alerts",
        "/budget",
        "/diary",
        "/goals",
        "/insights",
        "/reports",
        "/watchlist",
        // 영문 로케일 경로도 동일하게 차단
        "/en/login",
        "/en/dashboard",
        "/en/accounts",
        "/en/alerts",
        "/en/budget",
        "/en/diary",
        "/en/goals",
        "/en/insights",
        "/en/reports",
        "/en/watchlist",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
