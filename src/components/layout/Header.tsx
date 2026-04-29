"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useExchangeRate } from "@/hooks/use-api";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RefreshCw, LogOut, Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const { data, isLoading, mutate } = useExchangeRate();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshRate = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/exchange-rate", { method: "POST" });
      await mutate();
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-3 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-2">
        {/* 모바일에서만 보이는 햄버거 버튼 */}
        <button
          onClick={onMenuToggle}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
          aria-label="메뉴 열기"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3">
        <LanguageSwitcher />

        {/* 환율 pill — 모바일에서는 라벨 숨김 */}
        <div className="flex items-center gap-1 sm:gap-1.5 rounded-full border bg-muted/50 px-2 sm:px-3 py-1 text-xs">
          <span className="hidden sm:inline text-muted-foreground font-medium">USD/KRW</span>
          <span className="font-mono font-semibold whitespace-nowrap">
            {isLoading ? "···" : `₩${data?.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
          </span>
          <button
            onClick={handleRefreshRate}
            disabled={refreshing || isLoading}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="환율 새로고침"
            aria-label="환율 새로고침"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </button>
        </div>

        {/* 테마 토글 */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
          aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="로그아웃"
          aria-label="로그아웃"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
