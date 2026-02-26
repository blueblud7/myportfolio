"use client";

import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PrivacyProvider } from "@/contexts/privacy-context";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname.endsWith("/login");

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <PrivacyProvider>
      <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000 }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 pl-60">
            <Header />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </SWRConfig>
    </PrivacyProvider>
  );
}
