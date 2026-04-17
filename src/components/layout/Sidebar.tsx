"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, BarChart3, TrendingUp, BookOpen,
  Eye, EyeOff, FlaskConical, Bell, Sparkles, Activity, X, Filter, Layers, GitBranch, GitCompare, Microscope, PiggyBank, PieChart, Receipt, Waves,
} from "lucide-react";
import { InvestorQuote } from "./InvestorQuote";
import { usePrivacy } from "@/contexts/privacy-context";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { isPrivate, toggle } = usePrivacy();

  const navItems = [
    { href: "/", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/accounts", label: t("accounts"), icon: Wallet },
    { href: "/reports", label: t("reports"), icon: BarChart3 },
    { href: "/calculator", label: t("calculator"), icon: TrendingUp },
    { href: "/diary", label: t("diary"), icon: BookOpen },
    { href: "/quant", label: t("quant"), icon: FlaskConical },
    { href: "/backtest", label: t("backtest"), icon: Activity },
    { href: "/pattern", label: "패턴분석", icon: GitBranch },
    { href: "/insights", label: t("insights"), icon: Sparkles },
    { href: "/canslim", label: "CAN SLIM", icon: Filter },
    { href: "/etf-flow", label: "ETF 흐름", icon: Layers },
    { href: "/compare", label: "상대강도", icon: GitCompare },
    { href: "/strategy-lab", label: "전략 연구소", icon: Microscope },
    { href: "/position-lab", label: "자금관리 연구소", icon: PiggyBank },
    { href: "/portfolio-mix", label: "포트폴리오 믹스", icon: PieChart },
    { href: "/volatility", label: t("volatility"), icon: Waves },
    { href: "/budget", label: t("budget"), icon: Receipt },
    { href: "/alerts", label: t("alerts"), icon: Bell },
  ];

  return (
    <>
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-white">My Portfolio</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            title={isPrivate ? t("showAmounts") : t("hideAmounts")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              isPrivate ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 overflow-y-auto p-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">메뉴</p>
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" || pathname === "" : pathname.includes(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/20"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-400" : "")} />
              {item.label}
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Quote */}
      <div className="mt-auto">
        <InvestorQuote />
      </div>
    </>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* 데스크탑 사이드바: sticky, lg 이상에서만 */}
      <aside className="hidden w-60 shrink-0 lg:flex lg:flex-col sticky top-0 h-screen bg-zinc-950 overflow-y-auto z-30">
        <SidebarContent />
      </aside>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* 모바일 드로어 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-zinc-950 transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent onClose={onMobileClose} />
      </aside>
    </>
  );
}
