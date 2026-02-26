"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  Landmark,
  BarChart3,
  TrendingUp,
  BookOpen,
  Eye,
  EyeOff,
} from "lucide-react";
import { InvestorQuote } from "./InvestorQuote";
import { usePrivacy } from "@/contexts/privacy-context";

export function Sidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { isPrivate, toggle } = usePrivacy();

  const navItems = [
    { href: "/", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/accounts", label: t("accounts"), icon: Wallet },
    { href: "/bank", label: t("bank"), icon: Landmark },
    { href: "/reports", label: t("reports"), icon: BarChart3 },
    { href: "/calculator", label: t("calculator"), icon: TrendingUp },
    { href: "/diary", label: t("diary"), icon: BookOpen },
  ];

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col bg-zinc-950">
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-zinc-800">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">My Portfolio</span>
        </Link>
        <button
          onClick={toggle}
          title={isPrivate ? t("showAmounts") : t("hideAmounts")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            isPrivate
              ? "bg-blue-500/20 text-blue-400"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          )}
        >
          {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          메뉴
        </p>
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname === ""
              : pathname.includes(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/20"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-400" : "")} />
              {item.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Quote */}
      <div className="mt-auto">
        <InvestorQuote />
      </div>
    </aside>
  );
}
