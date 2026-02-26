"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const switchLocale = (newLocale: string) => {
    router.replace(
      // @ts-expect-error -- params type varies
      { pathname, params },
      { locale: newLocale }
    );
  };

  return (
    <div className="flex items-center gap-0.5 text-xs">
      <button
        onClick={() => switchLocale("ko")}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors",
          locale === "ko"
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        KO
      </button>
      <span className="text-muted-foreground/50">|</span>
      <button
        onClick={() => switchLocale("en")}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors",
          locale === "en"
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
    </div>
  );
}
