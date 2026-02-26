"use client";

import { usePrivacy } from "@/contexts/privacy-context";
import { formatCurrency, formatKRW, formatUSD } from "@/lib/format";

const MASK = "•••••";

interface Props {
  value: number;
  currency?: string;
  usd?: boolean;
}

export function Money({ value, currency, usd }: Props) {
  const { isPrivate } = usePrivacy();

  if (isPrivate) {
    return (
      <span className="select-none tracking-widest opacity-40">
        {MASK}
      </span>
    );
  }

  if (usd) return <>{formatUSD(value)}</>;
  if (currency) return <>{formatCurrency(value, currency)}</>;
  return <>{formatKRW(value)}</>;
}
