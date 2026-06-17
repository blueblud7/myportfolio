// 로그인이 필요한 경로 (단일 소스).
// Sidebar 자물쇠 아이콘과 ClientLayout 소프트게이트(블러 오버레이)가 이 목록을 공유한다.
// 비로그인 시 미들웨어(PUBLIC_PATHS)를 통과한 경로는 여기 블러 게이트로,
// 통과하지 못하는 경로(/bank·/tax 등)는 미들웨어가 /login 으로 하드 리다이렉트한다.
export const PRIVATE_PATHS = [
  // 포트폴리오
  "/dashboard",
  "/briefing",
  "/accounts",
  "/bank",
  "/watchlist",
  "/reports",
  "/tax",
  "/budget",
  "/goals",
  "/alerts",
  // 연구실
  "/insights",
  "/diary",
  "/strategy-lab",
  "/backtest",
  "/portfolio-mix",
  "/position-lab",
  "/etf-flow",
  "/pattern-lab",
] as const;

// locale prefix가 제거된 경로(stripped)가 잠금 대상인지 판별
export function isPrivatePath(stripped: string): boolean {
  return PRIVATE_PATHS.some((p) => stripped === p || stripped.startsWith(p + "/"));
}
