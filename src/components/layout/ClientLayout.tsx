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
          <div className="flex h-screen overflow-hidden">
            <Sidebar
              mobileOpen={mobileMenuOpen}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
              <Header onMenuToggle={() => setMobileMenuOpen((v) => !v)} />
              <main className="min-h-full bg-background p-3 sm:p-6">{children}</main>
            </div>
          </div>
        </SWRConfig>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
