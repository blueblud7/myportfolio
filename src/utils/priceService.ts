// 간단한 가격 서비스 (실제로는 API를 호출해야 함)
// 여기서는 모의 데이터를 사용합니다

export interface PriceData {
  symbol: string;
  price: number;
}

// 실제 구현에서는 Alpha Vantage, Yahoo Finance, CoinGecko 등의 API를 사용해야 합니다
export const getCurrentPrice = async (
  symbol: string,
  type: 'us_stock' | 'kr_stock' | 'crypto'
): Promise<number> => {
  // 모의 가격 반환 (실제로는 API 호출)
  // 예시: 랜덤하게 변동하는 가격 시뮬레이션
  const basePrice = 100;
  const variation = (Math.random() - 0.5) * 20; // ±10% 변동
  return Math.max(1, basePrice + variation);
};

// 여러 심볼의 가격을 한번에 가져오기
export const getCurrentPrices = async (
  symbols: { symbol: string; type: 'us_stock' | 'kr_stock' | 'crypto' }[]
): Promise<Map<string, number>> => {
  const prices = new Map<string, number>();
  for (const { symbol, type } of symbols) {
    const price = await getCurrentPrice(symbol, type);
    prices.set(symbol, price);
  }
  return prices;
};

// 전일 종가 가격 가져오기 (실제로는 API를 호출해야 함)
export const getPreviousClosePrice = async (
  symbol: string,
  type: 'us_stock' | 'kr_stock' | 'crypto'
): Promise<number> => {
  // 모의 전일 종가 반환 (실제로는 API 호출)
  // 예시: 현재 가격의 약간 변동된 값
  const currentPrice = await getCurrentPrice(symbol, type);
  const variation = (Math.random() - 0.5) * 5; // ±2.5% 변동
  return Math.max(1, currentPrice + variation);
};

// 여러 심볼의 전일 종가를 한번에 가져오기
export const getPreviousClosePrices = async (
  symbols: { symbol: string; type: 'us_stock' | 'kr_stock' | 'crypto' }[]
): Promise<Map<string, number>> => {
  const prices = new Map<string, number>();
  for (const { symbol, type } of symbols) {
    const price = await getPreviousClosePrice(symbol, type);
    prices.set(symbol, price);
  }
  return prices;
};
