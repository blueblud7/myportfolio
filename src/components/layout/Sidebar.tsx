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
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5" />
          <span>My Portfolio</span>
        </Link>
        <button
          onClick={toggle}
          title={isPrivate ? t("showAmounts") : t("hideAmounts")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            isPrivate
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <nav className="flex flex-col gap-1 p-3">
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <InvestorQuote />
      </div>
    </aside>
  );
}
