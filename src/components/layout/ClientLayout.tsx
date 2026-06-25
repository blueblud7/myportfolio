"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Sidebar } from "./Sidebar";
import { GlobalFooterDisclaimer } from "./Disclaimer";
import { PrivacyProvider } from "@/contexts/privacy-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { useSession } from "@/hooks/use-session";
import { PRIVATE_PATHS, isPrivatePath } from "@/lib/private-paths";

const GATE_META: Record<string, { title: string; desc: string; bullets: string[] }> = {
  "/dashboard":     { title: "내 포트폴리오", desc: "여러 계좌의 수익률·배분을 한눈에.", bullets: ["다계좌 통합 평가액", "실시간 손익 추적", "섹터·통화 배분 분석"] },
  "/briefing":      { title: "보유종목 브리핑", desc: "내 종목 뉴스·애널리스트 변화를 매일 요약.", bullets: ["일·주·월 다이제스트", "투자의견·목표가 변화 추적", "푸시 알림"] },
  "/accounts":      { title: "계좌 관리", desc: "증권사별 보유 종목과 수익률을 확인하세요.", bullets: ["계좌별 보유 종목", "평균 단가·수익률", "파이차트 배분"] },
  "/bank":          { title: "은행 잔액", desc: "예적금·현금 잔액을 자산에 합산하세요.", bullets: ["계좌별 잔액 기록", "총자산 자동 합산", "통화별 환산"] },
  "/watchlist":     { title: "워치리스트", desc: "관심 종목을 저장하고 모니터링하세요.", bullets: ["종목 저장·관리", "가격 알림 연동", "실적 일정 추적"] },
  "/insights":      { title: "AI 인사이트", desc: "내 포트폴리오 기반 AI 분석.", bullets: ["보유 종목 컨텍스트", "리밸런스 제안", "리스크 시나리오"] },
  "/reports":       { title: "성과 리포트", desc: "백분위·벤치마크 대비 수익률 분석.", bullets: ["CAGR·샤프 분석", "벤치마크 비교", "리스크 지표"] },
  "/tax":           { title: "양도소득세", desc: "실현 손익 기반 세금을 추정하세요.", bullets: ["실현 손익 집계", "양도세 추정", "절세 시뮬레이션"] },
  "/diary":         { title: "투자 일지", desc: "매매 근거와 결과를 기록하세요.", bullets: ["의사결정 기록", "패턴 발견", "승률 통계"] },
  "/budget":        { title: "예산 관리", desc: "월별 수입·지출을 추적하세요.", bullets: ["카테고리 분류", "목표 대비 현황", "월별 트렌드"] },
  "/goals":         { title: "투자 목표", desc: "목표 수익률과 달성도를 추적하세요.", bullets: ["목표 설정·추적", "달성률 시각화", "시뮬레이션"] },
  "/alerts":        { title: "알림 설정", desc: "가격·이벤트 알림을 설정하세요.", bullets: ["가격 도달 알림", "실적 발표 알림", "맞춤 조건 설정"] },
  // 연구실
  "/strategy-lab":  { title: "전략 연구소", desc: "나만의 투자 전략을 설계·검증하세요.", bullets: ["전략 규칙 설계", "조건 조합 테스트", "AI 전략 제안"] },
  "/backtest":      { title: "백테스트", desc: "과거 데이터로 전략 성과를 검증하세요.", bullets: ["기간별 수익률", "낙폭·샤프 분석", "벤치마크 비교"] },
  "/threshold-lab": { title: "임계값 매매 랩", desc: "X% 하락 매수·Y% 상승 매도 규칙을 검증하고 최적 임계값을 찾으세요.", bullets: ["임계값 백테스트", "기간별 변동성 추이", "임계값 그리드 추천"] },
  "/portfolio-mix": { title: "포트폴리오 믹스", desc: "자산 배분 조합을 시뮬레이션하세요.", bullets: ["비중 최적화", "효율적 프론티어", "리스크-수익 분석"] },
  "/position-lab":  { title: "포지션 사이징", desc: "리스크 기반 매수 규모를 계산하세요.", bullets: ["켈리·고정비율", "손절 기반 사이징", "분할 매수 설계"] },
  "/etf-flow":      { title: "ETF 흐름", desc: "ETF 자금 유출입 흐름을 추적하세요.", bullets: ["순유입·유출 추이", "섹터별 자금 흐름", "관심 ETF 모니터링"] },
  "/pattern-lab":   { title: "패턴 유사도", desc: "현재 주가와 닮은 과거 패턴을 찾으세요.", bullets: ["유사 패턴 매칭", "이후 전개 시나리오", "확률 분포 시각화"] },
};

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5 9-11"/>
    </svg>
  );
}

function SoftGateOverlay({ stripped }: { stripped: string }) {
  const key = PRIVATE_PATHS.find(p => stripped.startsWith(p)) ?? "/dashboard";
  const meta = GATE_META[key] ?? GATE_META["/dashboard"];

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "oklch(0.155 0.006 250 / 0.75)",
      backdropFilter: "blur(2px)",
      zIndex: 20,
      padding: "24px",
    }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 18,
        padding: "36px 40px",
        maxWidth: 380,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        boxShadow: "0 40px 80px -20px oklch(0 0 0 / 0.6)",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "var(--accent-bg)", color: "var(--accent)",
          display: "grid", placeItems: "center",
          border: "1px solid oklch(0.50 0.10 75 / 0.4)",
          marginBottom: 20,
        }}>
          <LockIcon />
        </div>

        {/* Title */}
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>
          {meta.title}
        </div>

        {/* Desc */}
        <div style={{ fontSize: 14, color: "var(--fg-3)", lineHeight: 1.55, marginBottom: 24 }}>
          {meta.desc}<br/>
          <span style={{ fontSize: 13 }}>로그인 후 바로 이용할 수 있어요.</span>
        </div>

        {/* Feature bullets */}
        <div style={{
          width: "100%",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          textAlign: "left",
        }}>
          {meta.bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-2)" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0 }}><CheckIcon /></span>
              {b}
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <Link
            href="/login"
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              height: 40, borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: "var(--accent)", color: "var(--accent-fg)",
              border: "none", textDecoration: "none",
              boxShadow: "0 8px 20px -8px var(--accent)",
            }}
          >
            로그인
          </Link>
          <Link
            href="/login"
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              height: 40, borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: "var(--bg-3)", color: "var(--fg)",
              border: "1px solid var(--border)", textDecoration: "none",
            }}
          >
            무료 시작
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loggedIn = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const stripped = pathname.replace(/^\/(ko|en)/, "") || "/";
  const isNoSidebar = stripped === "/" || stripped === "/login" || stripped === "/landing";
  const isPrivate = isPrivatePath(stripped);
  const showGate = isPrivate && loggedIn === false;

  if (isNoSidebar) {
    return <>{children}</>;
  }

  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000 }}>
          <div className="app">
            <Sidebar
              mobileOpen={mobileMenuOpen}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
            <div style={{ minWidth: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
              <div className="mobile-header">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ padding: "8px", color: "var(--fg-3)" }}
                  aria-label="메뉴 열기"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3 6h18M3 12h18M3 18h18"/>
                  </svg>
                </button>
              </div>
              <main style={{ flex: 1, padding: "var(--gutter)", minWidth: 0, position: "relative" }}>
                {showGate ? (
                  <>
                    <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", opacity: 0.35 }}>
                      {children}
                    </div>
                    <SoftGateOverlay stripped={stripped} />
                  </>
                ) : children}
              </main>
              <GlobalFooterDisclaimer />
            </div>
          </div>
        </SWRConfig>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
