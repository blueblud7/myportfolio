import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { jwtVerify } from "jose";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const SECRET_KEY = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "myportfolio-secret-blueming-2024-please-change"
);

function isLoginPath(pathname: string) {
  return pathname === "/login" || pathname === "/ko/login" || pathname === "/en/login";
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 로그인 페이지는 인증 불필요
  if (isLoginPath(pathname)) {
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

  // 미인증 → 로그인으로 리다이렉트
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
