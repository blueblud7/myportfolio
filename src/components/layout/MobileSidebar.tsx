"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, BarChart3, TrendingUp, BookOpen,
  Eye, EyeOff, FlaskConical, Bell, Sparkles, Activity, Menu, X,
} from "lucide-react";
import { usePrivacy } from "@/contexts/privacy-context";

export function MobileSidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { isPrivate, toggle } = usePrivacy();
  const [open, setOpen] = useState(false);

  const navItems = [
    { href: "/", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/accounts", label: t("accounts"), icon: Wallet },
    { href: "/reports", label: t("reports"), icon: BarChart3 },
    { href: "/calculator", label: t("calculator"), icon: TrendingUp },
    { href: "/diary", label: t("diary"), icon: BookOpen },
    { href: "/quant", label: t("quant"), icon: FlaskConical },
    { href: "/backtest", label: t("backtest"), icon: Activity },
    { href: "/insights", label: t("insights"), icon: Sparkles },
    { href: "/alerts", label: t("alerts"), icon: Bell },
  ];

  return (
    <>
      {/* 햄버거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 드로어 */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-zinc-950 transition-transform duration-300 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* 헤더 */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-white tracking-tight">My Portfolio</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                isPrivate ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:bg-zinc-800"
              )}
            >
              {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 네비 */}
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3 pt-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">메뉴</p>
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" || pathname === "" : pathname.includes(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
      </aside>
    </>
  );
}
