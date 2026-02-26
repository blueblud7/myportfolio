"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";

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
      className="mx-3 mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 transition-opacity duration-400"
      style={{ opacity: fade ? 1 : 0 }}
    >
      <Quote className="mb-1.5 h-3 w-3 text-blue-500/60" />
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        {quote.text}
      </p>
      <p className="mt-1.5 text-[10px] font-medium text-zinc-600 text-right">
        — {quote.author}
      </p>
    </div>
  );
}
