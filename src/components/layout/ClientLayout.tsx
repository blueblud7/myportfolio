"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Sidebar } from "./Sidebar";
import { GlobalFooterDisclaimer } from "./Disclaimer";
import { PrivacyProvider } from "@/contexts/privacy-context";
import { ThemeProvider } from "@/contexts/theme-context";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname.endsWith("/login") || pathname.endsWith("/landing");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000 }}>
          <div className="app">
            <Sidebar
              mobileOpen={mobileMenuOpen}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
            <div style={{ minWidth: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Mobile header bar */}
              <div className="mobile-header" style={{ display: "none" }}>
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ padding: "8px", color: "var(--fg-3)" }}
                  aria-label="메뉴 열기"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3 6h18M3 12h18M3 18h18"/>
                  </svg>
                </button>
              </div>
              <main style={{ flex: 1, padding: "var(--gutter)", minWidth: 0 }}>{children}</main>
              <GlobalFooterDisclaimer />
            </div>
          </div>
        </SWRConfig>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
