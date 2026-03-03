"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PrivacyProvider } from "@/contexts/privacy-context";
import { ThemeProvider } from "@/contexts/theme-context";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname.endsWith("/login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000 }}>
          <div className="flex min-h-screen">
            <Sidebar
              mobileOpen={mobileMenuOpen}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
            <div className="flex-1 min-w-0">
              <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />
              <main className="min-h-screen bg-zinc-50 p-4 sm:p-6 dark:bg-zinc-900">{children}</main>
            </div>
          </div>
        </SWRConfig>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
