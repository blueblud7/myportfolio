"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface FeatureTab {
  href: string;
  label: string;
}

/**
 * 관련 페이지들을 하나의 기능군으로 묶어주는 상단 탭 바.
 * 별도 라우트를 유지하면서도 한 화면처럼 탐색되도록 한다. (예: 스크리너/CAN SLIM/텐베거)
 */
export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const pathname = usePathname();
  return (
    <div className="seg seg-sm" style={{ flexWrap: "wrap" }}>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link key={tab.href} href={tab.href} className={cn("seg-btn", active && "active")}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export const SCREENER_TABS: FeatureTab[] = [
  { href: "/screener", label: "종목 스크리너" },
  { href: "/canslim", label: "CAN SLIM" },
  { href: "/ten-bagger", label: "텐베거" },
];

export const PATTERN_TABS: FeatureTab[] = [
  { href: "/pattern-lab", label: "패턴 유사도" },
  { href: "/pattern", label: "에피소드 분석" },
];
