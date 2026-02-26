"use client";

import { useRouter } from "next/navigation";
import { useExchangeRate } from "@/hooks/use-api";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RefreshCw, LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

export function Header() {
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const { data, isLoading, mutate } = useExchangeRate();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur-md">
      <div />
      <div className="flex items-center gap-3">
        <LanguageSwitcher />

        {/* 환율 pill */}
        <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs">
          <span className="text-muted-foreground font-medium">USD/KRW</span>
          <span className="font-mono font-semibold">
            {isLoading ? "···" : `₩${data?.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
          </span>
          <button
            onClick={() => mutate()}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            title="환율 새로고침"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* 테마 토글 */}
        <button
          onClick={toggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="로그아웃"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
