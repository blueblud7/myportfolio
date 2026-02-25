const KOSPI_MAJOR = new Set([
  "005930", "000660", "005380", "035420", "005490", "051910", "006400",
  "003550", "105560", "055550", "034730", "015760", "012330", "066570",
  "003490", "032830", "096770", "033780", "009150", "017670", "028260",
  "030200", "086790", "011200", "034020", "018260", "316140", "010130",
  "000270", "024110", "036570", "009540", "010950", "002790", "090430",
  "000810", "021240", "001570", "068270", "035250",
]);

export function isKoreanTicker(ticker: string): boolean {
  return /^\d{6}$/.test(ticker);
}

export function resolveYahooSymbol(ticker: string): string {
  if (!isKoreanTicker(ticker)) {
    return ticker.toUpperCase();
  }
  const suffix = KOSPI_MAJOR.has(ticker) ? ".KS" : ".KQ";
  return `${ticker}${suffix}`;
}

export function resolveYahooSymbols(tickers: string[]): string[] {
  return tickers.map(resolveYahooSymbol);
}

export function extractTicker(yahooSymbol: string): string {
  return yahooSymbol.replace(/\.(KS|KQ)$/, "");
}
