"use client";

import { SWRConfig } from "swr";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
      }}
    >
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 pl-60">
          <Header />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </SWRConfig>
  );
}
