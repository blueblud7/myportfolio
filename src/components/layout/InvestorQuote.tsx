"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export function InvestorQuote() {
  const t = useTranslations("InvestorQuotes");
  const quotes = t.raw("quotes") as { text: string; author: string }[];
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % quotes.length);
        setFade(true);
      }, 400);
    }, 12000);
    return () => clearInterval(id);
  }, [quotes.length]);

  const quote = quotes[index];

  return (
    <div
      className="px-4 py-4 border-t transition-opacity duration-400"
      style={{ opacity: fade ? 1 : 0 }}
    >
      <p className="text-[11px] text-muted-foreground leading-relaxed italic">
        &ldquo;{quote.text}&rdquo;
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-muted-foreground/70 text-right">
        — {quote.author}
      </p>
    </div>
  );
}
