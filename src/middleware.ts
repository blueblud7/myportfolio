import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { jwtVerify } from "jose";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const SECRET_KEY = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "myportfolio-secret-blueming-2024-please-change"
);

// 로그인 없이 접근 가능한 공개 경로 (locale prefix 제거 후 비교)
const PUBLIC_PATHS = [
  "/login",
  "/stocks",
  "/krx-market",
  "/analyst-reports",
  "/earnings",
  "/quant",
  "/etf-flow",
  "/pattern-lab",
  "/ten-bagger",
  "/fomo-agents",
  "/strategy-lab",
  "/backtest",
  "/portfolio-mix",
  "/calculator",
  "/compare",
  "/volatility",
  "/canslim",
  "/pattern",
  "/position-lab",
];

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
}

function isPublicPath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + "/"));
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 공개 경로는 인증 없이 통과
  if (isPublicPath(pathname)) {
    return intlMiddleware(req);
  }

  // 세션 쿠키 검증
  const token = req.cookies.get("session")?.value;
  if (token) {
    try {
      await jwtVerify(token, SECRET_KEY);
      return intlMiddleware(req);
    } catch {
      // 토큰 만료 또는 변조
    }
  }

  // 미인증 → 로그인으로 리다이렉트 (원래 경로를 redirect 파라미터로 전달)
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
