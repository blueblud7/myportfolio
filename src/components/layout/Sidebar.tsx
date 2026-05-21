"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useReports } from "@/hooks/use-api";

// Inline SVG icon set matching the design
function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":     return <svg {...p}><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>;
    case "wallet":   return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.2" fill="currentColor"/></svg>;
    case "search":   return <svg {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>;
    case "filter":   return <svg {...p}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case "flask":    return <svg {...p}><path d="M9 3h6"/><path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3"/></svg>;
    case "book":     return <svg {...p}><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/></svg>;
    case "tool":     return <svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5z"/></svg>;
    case "eye":      return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "eye-off":  return <svg {...p}><path d="m3 3 18 18"/><path d="M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 4"/><path d="M7 7C3.6 9 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.2-.8"/></svg>;
    case "command":  return <svg {...p}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>;
    case "logout":   return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case "target":   return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>;
    case "layers":   return <svg {...p}><path d="m12 4 9 4-9 4-9-4z"/><path d="m3 12 9 4 9-4"/><path d="m3 16 9 4 9-4"/></svg>;
    case "trending": return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case "activity": return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "rocket":   return <svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
    case "sparkles": return <svg {...p}><path d="M5 3v4M3 5h4M18 14v6M15 17h6M11 4l1.6 4.2L17 10l-4.4 1.4L11 16l-1.4-4.4L5 10l4.4-1.4z"/></svg>;
    case "binoculars": return <svg {...p}><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M6 11V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="10" y1="15" x2="14" y2="15"/></svg>;
    case "barchart": return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case "filedoc":  return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case "piechart": return <svg {...p}><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>;
    case "microscope": return <svg {...p}><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14v-3"/><path d="M9 3v4"/><path d="M7 7h4"/></svg>;
    case "receipt":  return <svg {...p}><polyline points="9 7 6 7 3 7"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><line x1="3" y1="11" x2="21" y2="11"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>;
    case "bell":     return <svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "linechart": return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    default: return null;
  }
}

// requiresAuth: true → 로그인 필요 (비로그인 시 자물쇠 표시)
const NAV = [
  {
    section: "포트폴리오",
    items: [
      { href: "/dashboard", label: "대시보드",          icon: "home",       requiresAuth: true },
      { href: "/accounts",  label: "보유 자산",          icon: "wallet",     requiresAuth: true },
      { href: "/watchlist", label: "워치리스트",          icon: "binoculars", requiresAuth: true },
      { href: "/reports",   label: "리포트 & 목표",      icon: "barchart",   requiresAuth: true },
    ],
  },
  {
    section: "분석",
    items: [
      { href: "/stocks",          label: "종목 정보",      icon: "search"    },
      { href: "/krx-market",      label: "한국 시장",      icon: "piechart"  },
      { href: "/analyst-reports", label: "증권사 리포트",  icon: "filedoc"   },
      { href: "/earnings",        label: "실적",           icon: "calendar"  },
      { href: "/quant",           label: "퀀트",           icon: "activity"  },
    ],
  },
  {
    section: "연구실",
    items: [
      { href: "/strategy-lab",   label: "전략 연구소",     icon: "microscope" },
      { href: "/etf-flow",       label: "ETF 흐름",        icon: "layers"     },
      { href: "/pattern-lab",    label: "패턴 유사도",     icon: "linechart"  },
      { href: "/ten-bagger",     label: "텐베거 스크리너", icon: "rocket"     },
      { href: "/insights",       label: "AI 인사이트",     icon: "sparkles",  requiresAuth: true },
      { href: "/diary",          label: "저널",            icon: "book",      requiresAuth: true },
    ],
  },
  {
    section: "도구",
    items: [
      { href: "/calculator",    label: "계산기",  icon: "trending"               },
      { href: "/budget",        label: "예산",    icon: "receipt", requiresAuth: true },
      { href: "/alerts",        label: "알림",    icon: "bell",    requiresAuth: true },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}


function SummaryFooter({
  loggedIn,
  isPrivate,
  toggle,
  handleLogout,
  handleLogin,
}: {
  loggedIn: boolean | null;
  isPrivate: boolean;
  toggle: () => void;
  handleLogout: () => void;
  handleLogin: () => void;
}) {
  const { data: reports } = useReports();

  if (!loggedIn) {
    return (
      <div className="sidebar-foot">
        <button
          onClick={handleLogin}
          className="btn btn-primary"
          style={{ height: 26, padding: "0 12px", fontSize: 11, gap: 6, width: "100%" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          로그인
        </button>
      </div>
    );
  }

  const total = reports?.by_account?.reduce((s, a) => s + a.value_krw, 0) ?? 0;
  const gainLoss = reports?.all_performers?.reduce((s, p) => s + p.gain_loss, 0) ?? 0;
  const gainLossPct = total - gainLoss > 0 ? (gainLoss / (total - gainLoss)) * 100 : 0;
  const hasData = reports != null && total > 0;

  const fmtTotal = (): string => {
    if (isPrivate) return "•••••••";
    if (!hasData) return "—";
    return total >= 1e8
      ? `₩${(total / 1e8).toFixed(2)}억`
      : `₩${(total / 1e4).toFixed(0)}만`;
  };

  const fmtGainLoss = (): string => {
    if (isPrivate) return "•••";
    if (!hasData) return "—";
    return `${gainLoss >= 0 ? "+" : "−"}₩${Math.abs(gainLoss / 1e4).toFixed(0)}만`;
  };

  return (
    <div className="sidebar-foot">
      <div className="summary-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="summary-label">총 자산</span>
          <button className="btn-ghost" title={isPrivate ? "금액 표시" : "금액 숨김"} onClick={toggle}>
            <Icon name={isPrivate ? "eye-off" : "eye"} size={13} />
          </button>
        </div>
        <div className={`summary-value${!hasData ? " fg-4" : ""}`}>{fmtTotal()}</div>
        {hasData && (
          <div className="summary-row">
            <span className={`delta ${gainLoss > 0 ? "up" : gainLoss < 0 ? "down" : "plain"}`}>
              {gainLoss > 0 ? "▲" : gainLoss < 0 ? "▼" : "·"}
              <span className="num">{Math.abs(gainLossPct).toFixed(2)}%</span>
            </span>
            <span className="fg-4 mono" style={{ fontSize: 11 }}>{fmtGainLoss()}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          onClick={handleLogout}
          className="btn btn-ghost"
          style={{ flex: 1, height: 26, fontSize: 11 }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { isPrivate, toggle } = usePrivacy();
  const router = useRouter();
  const loggedIn = useSession();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleLogin = () => {
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    onClose?.();
  };

  const isActive = (href: string) =>
    pathname.includes(href);

  return (
    <>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-mark">P</div>
        <div>
          <div className="brand-name">Portfolio</div>
          <div className="brand-sub">v2 · ko</div>
        </div>
      </div>

      {/* ⌘K search */}
      <button className="sidebar-cmd" onClick={() => {}}>
        <Icon name="search" size={13} />
        <span>빠른 검색</span>
        <span className="kbd">⌘K</span>
      </button>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map((sec) => (
          <div className="nav-section" key={sec.section}>
            <div className="nav-section-title">{sec.section}</div>
            {sec.items.map((it) => {
              const locked = it.requiresAuth && loggedIn === false;
              return (
                <Link
                  key={it.href}
                  href={it.href as Parameters<typeof Link>[0]["href"]}
                  onClick={onClose}
                  className={cn("nav-item", isActive(it.href) && "active", locked && "locked")}
                  title={locked ? "로그인 후 이용 가능" : undefined}
                >
                  <Icon name={it.icon} size={15} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {locked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <SummaryFooter
        loggedIn={loggedIn}
        isPrivate={isPrivate}
        toggle={toggle}
        handleLogout={handleLogout}
        handleLogin={handleLogin}
      />
    </>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        style={{
          position: "fixed", inset: "0 auto 0 0", zIndex: 50,
          width: 224, display: "flex", flexDirection: "column",
          background: "var(--bg)", borderRight: "1px solid var(--border)",
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 300ms ease",
        }}
        className="lg:hidden"
      >
        <SidebarContent onClose={onMobileClose} />
      </aside>
    </>
  );
}
