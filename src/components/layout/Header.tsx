"use client";

import { useRouter } from "next/navigation";
import { useExchangeRate } from "@/hooks/use-api";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RefreshCw, LogOut } from "lucide-react";

export function Header() {
  const router = useRouter();
  const { data, isLoading, mutate } = useExchangeRate();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div />
      <div className="flex items-center gap-4">
        <LanguageSwitcher />
        <button
          onClick={handleLogout}
          className="rounded p-1 hover:bg-accent"
          title="로그아웃"
        >
          <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">USD/KRW</span>
          <span className="font-mono font-semibold">
            {isLoading ? "..." : `₩${data?.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
          </span>
          <button
            onClick={() => mutate()}
            className="rounded p-1 hover:bg-accent"
            title="환율 새로고침"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
}
