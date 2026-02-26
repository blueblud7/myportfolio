"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  Landmark,
  BarChart3,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import { InvestorQuote } from "./InvestorQuote";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/accounts", label: "계좌 관리", icon: Wallet },
  { href: "/bank", label: "은행 계좌", icon: Landmark },
  { href: "/reports", label: "리포트", icon: BarChart3 },
  { href: "/calculator", label: "미래 예측", icon: TrendingUp },
  { href: "/diary", label: "투자 일기", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5" />
          <span>My Portfolio</span>
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
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
