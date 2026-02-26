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

/** 통화 기호 없이 압축 표기 (헤더에 단위 표시, 셀엔 숫자만) */
export function formatCompact(value: number, currency: string, locale: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (currency === "KRW" && locale === "ko") {
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
    if (abs >= 1e4) return `${sign}${(abs / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만`;
    return `${sign}${abs.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  }

  // en locale (KRW or USD) → K / M / B
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: currency === "USD" ? 2 : 0 })}`;
}

/** 컴팩트 포맷에 사용할 헤더 단위 표시 */
export function currencyUnit(currency: string, locale: string): string {
  if (currency === "KRW") return locale === "ko" ? "원" : "KRW";
  return "$";
}
