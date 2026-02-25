export function formatKRW(value: number): string {
  if (Math.abs(value) >= 1e8) {
    return `₩${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  }
  if (Math.abs(value) >= 1e4) {
    return `₩${(value / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만`;
  }
  return `₩${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

export function formatUSD(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCurrency(value: number, currency: string): string {
  return currency === "USD" ? formatUSD(value) : formatKRW(value);
}

export function gainLossColor(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}
